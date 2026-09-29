import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_SERVER_MODULES } from "../registry";
import type { GameFetchResult, ScoreFetchContext } from "../types";
import type { FetchedMaimaiData } from "./scores/types";

const maimaiScores = vi.hoisted(() => ({
  loaded: vi.fn(),
  run: vi.fn(),
  persist: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock("./scores/orchestrator", () => {
  maimaiScores.loaded();
  return { runMaimaiFetcher: maimaiScores.run, persistMaimaiExtra: maimaiScores.persist };
});
vi.mock("./scores/normalize", () => ({ normalizeFetchedMaimaiData: maimaiScores.normalize }));
vi.mock("@/lib/db", () => ({ db: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("maimai score source", () => {
  it("rejects a stored CN single-use token but accepts a newly supplied one", () => {
    const validateToken = GAME_SERVER_MODULES.maimai.scores.validateToken!;
    const token = "cn-cookies://token";

    expect(() => validateToken({ token, tokenProvided: false }))
      .toThrow(expect.objectContaining({ code: "CN_COOKIES_SINGLE_USE" }));
    expect(() => validateToken({ token, tokenProvided: true }))
      .not.toThrow();
  });

  it("normalizes the fetched data and hands the raw fetch to the maimai extras", async () => {
    const fetched = { albumData: [] } as unknown as FetchedMaimaiData;
    const result = { scores: [] } as unknown as GameFetchResult;
    maimaiScores.run.mockResolvedValue({ fetched });
    maimaiScores.normalize.mockResolvedValue(result);
    const context = { game: "maimai", region: "jp", gameVersion: 14, shouldFetchAlbums: true } as ScoreFetchContext;

    expect(maimaiScores.loaded).not.toHaveBeenCalled();
    const { result: normalized, persistExtra } = await GAME_SERVER_MODULES.maimai.scores.fetch(context);

    expect(normalized).toBe(result);
    expect(maimaiScores.run).toHaveBeenCalledWith(context);
    expect(maimaiScores.normalize).toHaveBeenCalledWith(fetched, { region: "jp", version: 14 });

    const persisted = { snapshotId: 1 } as Parameters<NonNullable<typeof persistExtra>>[0];
    const backgroundWork = { promise: Promise.resolve() };
    await persistExtra?.(persisted, backgroundWork);
    expect(maimaiScores.persist).toHaveBeenCalledWith(persisted, fetched, true, backgroundWork);
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
