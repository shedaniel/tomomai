import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_SERVER_MODULES } from "../registry";
import type { FetchRun } from "../fetch-run";
import type { ScoreFetchContext, ScoreFetchOutcome } from "../types";

const maimaiScores = vi.hoisted(() => ({ loaded: vi.fn(), fetch: vi.fn() }));
vi.mock("./scores/score-source", () => {
  maimaiScores.loaded();
  return { fetchMaimaiScores: maimaiScores.fetch };
});
vi.mock("@/lib/db", () => ({ db: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("maimai score source", () => {
  it("refuses a stored CN proxy session, which its first fetch consumed, and nothing else", () => {
    const { rejectStoredToken } = GAME_SERVER_MODULES.maimai.scores;
    expect(rejectStoredToken?.("cn-cookies://userId=1")).toMatchObject({ code: "CN_COOKIES_SINGLE_USE" });
    expect(rejectStoredToken?.("lxns://a:://r:://0:://read")).toBeNull();
    expect(rejectStoredToken?.("account://name:://pass")).toBeNull();
    expect(rejectStoredToken?.("unreadable")).toBeNull();
  });

  it("loads the providers only when a fetch starts and returns their outcome", async () => {
    const outcome = { result: { scores: [] } } as unknown as ScoreFetchOutcome;
    maimaiScores.fetch.mockResolvedValue(outcome);
    const context = { game: "maimai", region: "jp", gameVersion: 14 } as ScoreFetchContext;
    const run = {} as FetchRun;

    expect(maimaiScores.loaded).not.toHaveBeenCalled();
    await expect(GAME_SERVER_MODULES.maimai.scores.fetch(context, run)).resolves.toBe(outcome);
    expect(maimaiScores.loaded).toHaveBeenCalledOnce();
    expect(maimaiScores.fetch).toHaveBeenCalledWith(context, run);
  });
});

describe("maimai reserved profiles", () => {
  it("resolve reserved usernames case-insensitively and nothing else", async () => {
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("MAX")).resolves.toMatchObject({ id: "reserved-max", publishProfile: true });
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("someone")).resolves.toBeNull();
  });

  it("keep a concrete main region when maimai has no enabled region", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    await expect(GAME_SERVER_MODULES.maimai.reserved?.user("maxbas")).resolves.toMatchObject({ profileMainRegion: "intl" });
  });
});
