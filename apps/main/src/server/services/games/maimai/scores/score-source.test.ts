import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  sega: vi.fn(), cnCookies: vi.fn(), lxns: vi.fn(), divingfish: vi.fn(), remove: vi.fn(),
}));
vi.mock("./providers/sega-scrape", () => ({ fetchWithSegaLogin: mocks.sega, fetchWithCnCookies: mocks.cnCookies }));
vi.mock("./providers/lxns", () => ({ fetchFromLxns: mocks.lxns }));
vi.mock("./providers/divingfish", () => ({ fetchFromDivingFish: mocks.divingfish }));
vi.mock("@/server/services/games/tokens", () => ({ deleteToken: mocks.remove }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

import type { Region } from "@/lib/types";
import type { FetchRun } from "@/server/services/games/fetch-run";
import type { ScoreFetchContext } from "@/server/services/games/types";
import { fetchMaimaiScores } from "./score-source";

const run = {} as FetchRun;

function context(region: Region, token: string): ScoreFetchContext {
  return {
    game: "maimai", userId: "user", region, token, sessionId: BigInt(1), gameVersion: 14,
    flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const provider of [mocks.sega, mocks.cnCookies, mocks.lxns, mocks.divingfish]) provider.mockResolvedValue({ result: "fetched" });
});

describe("maimai score source", () => {
  it.each([
    { region: "intl", token: "cookie://clal=abc", provider: "sega", parsed: { provider: "sega-cookie", clal: "abc" } },
    { region: "jp", token: "account://name:://pass", provider: "sega", parsed: { provider: "sega-account", username: "name", password: "pass" } },
    { region: "cn", token: "cn-cookies://userId=1", provider: "cnCookies", parsed: { provider: "cn-cookies", cookies: "userId=1" } },
    { region: "cn", token: "lxns://a:://r:://9:://read", provider: "lxns", parsed: { provider: "lxns", accessToken: "a", refreshToken: "r", expiresAtMs: 9, scope: "read" } },
    { region: "cn", token: "divingfish://qq:://1", provider: "divingfish", parsed: { provider: "divingfish", account: { kind: "qq", value: "1" } } },
  ] as const)("fetches $region with the $parsed.provider token through its provider", async ({ region, token, provider, parsed }) => {
    const ctx = context(region, token);
    await expect(fetchMaimaiScores(ctx, run)).resolves.toEqual({ result: "fetched" });
    expect(mocks[provider]).toHaveBeenCalledExactlyOnceWith(ctx, parsed, run);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes a token the region does not sign in with before any provider runs", async () => {
    await expect(fetchMaimaiScores(context("intl", "lxns://a:://r:://9:://read"), run)).rejects.toThrow("not supported in this region");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "user", "intl");
    for (const provider of [mocks.sega, mocks.cnCookies, mocks.lxns, mocks.divingfish]) expect(provider).not.toHaveBeenCalled();
  });
});
