import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import { GAME_SERVER_MODULES, requireConfiguredSource } from "../registry";
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

describe("maimai score source", () => {
  it("rejects a stored CN single-use token but accepts a newly supplied one", () => {
    const validateToken = requireConfiguredSource("maimai", "scores").validateToken!;
    const context = {
      game: "maimai" as const,
      userId: "user-1",
      region: "cn" as const,
      flags: {} as Flags,
      token: "cn-cookies://token",
    };

    expect(() => validateToken({ ...context, tokenProvided: false }))
      .toThrow("CN_COOKIES_SINGLE_USE");
    expect(() => validateToken({ ...context, tokenProvided: true }))
      .not.toThrow();
  });

  it("normalizes the fetched data and hands the raw fetch to the maimai extras", async () => {
    const fetched = { albumData: [] } as unknown as FetchedMaimaiData;
    const result = { scores: [] } as unknown as GameFetchResult;
    maimaiScores.run.mockResolvedValue({ fetched });
    maimaiScores.normalize.mockResolvedValue(result);
    const context = { game: "maimai", region: "jp", gameVersion: 14, shouldFetchAlbums: true } as ScoreFetchContext;

    expect(maimaiScores.loaded).not.toHaveBeenCalled();
    const { result: normalized, persistExtra } = await requireConfiguredSource("maimai", "scores").fetch(context);

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
});
