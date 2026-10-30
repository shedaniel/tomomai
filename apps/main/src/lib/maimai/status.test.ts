import { beforeEach, describe, expect, it, vi } from "vitest";

// Each select() resolves to the next queued result: first the average fetch
// duration (unless cached), then the count of recent fetches.
const queue = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: async () => {
          const next = queue.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      }),
    })),
  },
}));
vi.mock("./budget", () => ({ getMaimaiLock: async () => ({ locked: false, retryAfterSeconds: 0 }) }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));

import { db } from "@/lib/db";
import { clampFetchSeconds, getMaimaiStatus, isMaimaiBusy } from "./status";

beforeEach(() => {
  queue.length = 0;
  vi.clearAllMocks();
});

describe("maimai load estimate", () => {
  it("is busy once three other users' fetches are running", async () => {
    queue.push([{ seconds: "48.5" }], [{ fetches: 2 }]);
    expect(await isMaimaiBusy("intl", "me")).toBe(false);

    queue.push([{ fetches: 3 }]);
    expect(await getMaimaiStatus("intl", "me")).toEqual({ locked: false, retryAfterSeconds: 0, busy: true });
  });

  it("reuses the average fetch duration for an hour per region", async () => {
    queue.push([{ seconds: "40" }], [{ fetches: 0 }], [{ fetches: 0 }]);
    await isMaimaiBusy("jp", "me");
    await isMaimaiBusy("jp", "me");

    expect(db.select).toHaveBeenCalledTimes(3);
  });

  it("falls back to a sane window when there are no completed fetches", () => {
    expect(clampFetchSeconds(Number(null))).toBe(60);
    expect(clampFetchSeconds(5)).toBe(30);
    expect(clampFetchSeconds(900)).toBe(180);
    expect(clampFetchSeconds(47)).toBe(47);
  });

  it("doesn't warn when the database is unavailable", async () => {
    queue.push(new Error("db down"));
    expect(await isMaimaiBusy("cn", "me")).toBe(false);
  });
});
