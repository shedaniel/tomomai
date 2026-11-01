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
    exists: vi.fn(async (key: string) => ((expiries.get(key) ?? 0) > Date.now() ? 1 : 0)),
  };
  return { redis, expiries };
});

vi.mock("@tomomai/security/redis", () => ({ getRedis: () => store.redis }));
vi.mock("rate-limiter-flexible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rate-limiter-flexible")>();
  return { ...actual, RateLimiterRedis: actual.RateLimiterMemory };
});
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { getGameSiteStatus, markSiteLocked, takeSiteRequest } from "./budget";
import { GameSiteLockedError } from "./errors";

const INTL = "https://maimaidx-eng.com/maimai-mobile/home/";
const CHUNITHM_INTL = "https://chunithm-net-eng.com/mobile/home/";

beforeEach(() => {
  store.expiries.clear();
  store.redis.failing = false;
  vi.clearAllMocks();
});

describe("game site request budget", () => {
  it("leaves requests to other hosts alone", async () => {
    await takeSiteRequest("https://lng-tgk-aime-gw.am-all.net/common_auth/login");
    await takeSiteRequest("https://maimai.wahlap.com/maimai-mobile/home/");
    expect(store.redis.ttl).not.toHaveBeenCalled();
  });

  it("paces a burst to the configured rate and marks the host busy", async () => {
    const started = Date.now();

    await Promise.all(Array.from({ length: 12 }, () => takeSiteRequest(INTL)));

    // 5 per second: the 6th-10th wait for the next second, the 11th-12th for the one after.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
    expect(await getGameSiteStatus("maimai", "intl")).toMatchObject({ locked: false, busy: true });
    expect(await getGameSiteStatus("maimai", "jp")).toMatchObject({ busy: false });
    expect(await getGameSiteStatus("chunithm", "intl")).toMatchObject({ busy: false });
  });

  it("stops every request while maimai has us locked out", async () => {
    await markSiteLocked(INTL);

    await expect(takeSiteRequest(INTL)).rejects.toBeInstanceOf(GameSiteLockedError);
    const status = await getGameSiteStatus("maimai", "intl");
    expect(status.locked).toBe(true);
    expect(status.retryAfterSeconds).toBeGreaterThan(250);
    await expect(takeSiteRequest("https://maimaidx.jp/maimai-mobile/home/")).resolves.toBeUndefined();
    await expect(takeSiteRequest(CHUNITHM_INTL)).resolves.toBeUndefined();
  });

  it("budgets and locks CHUNITHM-NET hosts the same way, under their own keys", async () => {
    await markSiteLocked(CHUNITHM_INTL);

    await expect(takeSiteRequest(CHUNITHM_INTL)).rejects.toThrow("CHUNITHM-NET has temporarily locked");
    expect(store.expiries.has("chunithm:locked:chunithm-net-eng.com")).toBe(true);
    expect(await getGameSiteStatus("chunithm", "intl")).toMatchObject({ locked: true });
    await expect(takeSiteRequest(INTL)).resolves.toBeUndefined();
  });

  it("fails open quickly when Redis hangs, then skips the budget for a while", async () => {
    store.redis.ttl.mockImplementationOnce(() => new Promise(() => {}));
    const started = Date.now();

    await expect(takeSiteRequest(INTL)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1500);

    store.redis.ttl.mockClear();
    await takeSiteRequest(INTL);
    expect(store.redis.ttl).not.toHaveBeenCalled();
  });
});
