import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the few Redis commands the budget uses; the
// limiter itself runs on rate-limiter-flexible's memory backend.
const store = vi.hoisted(() => {
  const expiries = new Map<string, number>();
  const redis = {
    failing: false,
    ttl: vi.fn(async (key: string) => {
      if (redis.failing) throw new Error("redis down");
      const expiry = expiries.get(key);
      if (expiry === undefined || expiry <= Date.now()) return -2;
      return Math.ceil((expiry - Date.now()) / 1000);
    }),
    set: vi.fn(async (key: string, _value: string, _ex: "EX", seconds: number) => {
      expiries.set(key, Date.now() + seconds * 1000);
      return "OK";
    }),
  };
  return { redis, expiries };
});

vi.mock("@tomomai/security/redis", () => ({ getRedis: () => store.redis }));
vi.mock("rate-limiter-flexible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rate-limiter-flexible")>();
  return { ...actual, RateLimiterRedis: actual.RateLimiterMemory };
});
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { getMaimaiLock, markMaimaiLocked, takeMaimaiRequest } from "./budget";
import { MaimaiLockedError } from "./errors";

const INTL = "https://maimaidx-eng.com/maimai-mobile/home/";

beforeEach(() => {
  store.expiries.clear();
  store.redis.failing = false;
  vi.clearAllMocks();
});

describe("maimai request budget", () => {
  it("leaves requests to other hosts alone", async () => {
    await takeMaimaiRequest("https://lng-tgk-aime-gw.am-all.net/common_auth/login");
    expect(store.redis.ttl).not.toHaveBeenCalled();
  });

  it("paces a burst to the configured rate", async () => {
    const started = Date.now();

    await Promise.all(Array.from({ length: 12 }, () => takeMaimaiRequest(INTL)));

    // 5 per second: the 6th-10th wait for the next second, the 11th-12th for the one after.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
  });

  it("stops every request while maimai has us locked out", async () => {
    await markMaimaiLocked(INTL);

    await expect(takeMaimaiRequest(INTL)).rejects.toBeInstanceOf(MaimaiLockedError);
    const lock = await getMaimaiLock("intl");
    expect(lock.locked).toBe(true);
    expect(lock.retryAfterSeconds).toBeGreaterThan(250);
    await expect(takeMaimaiRequest("https://maimaidx.jp/maimai-mobile/home/")).resolves.toBeUndefined();
  });

  it("fails open quickly when Redis hangs, then skips the budget for a while", async () => {
    store.redis.ttl.mockImplementationOnce(() => new Promise(() => {}));
    const started = Date.now();

    await expect(takeMaimaiRequest(INTL)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1500);

    store.redis.ttl.mockClear();
    await takeMaimaiRequest(INTL);
    expect(store.redis.ttl).not.toHaveBeenCalled();
  });
});
