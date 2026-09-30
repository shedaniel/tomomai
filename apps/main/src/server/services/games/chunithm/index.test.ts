import { beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_SERVER_MODULES } from "../registry";
import type { FetchRun } from "../fetch-run";
import type { ScoreFetchContext, ScoreFetchOutcome } from "../types";

const catalog = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock("./catalog/sources/otoge-db", () => {
  catalog.loaded();
  return { OtogeDbFetcher: vi.fn() };
});

const scores = vi.hoisted(() => ({ loaded: vi.fn(), fetch: vi.fn() }));
vi.mock("./scores/score-source", () => {
  scores.loaded();
  return { fetchChunithmScores: scores.fetch };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CHUNITHM catalog source", () => {
  it("loads the otoge-db source only when its stages are requested", async () => {
    const source = GAME_SERVER_MODULES.chunithm.catalog;
    expect(catalog.loaded).not.toHaveBeenCalled();
    expect((await source.stages("jp")).map(stage => stage.name)).toEqual(["OtogeDB"]);
    expect(catalog.loaded).toHaveBeenCalledOnce();
  });

  it("estimates a plus level at .5 and keeps cover rules of its own", () => {
    const source = GAME_SERVER_MODULES.chunithm.catalog;
    expect(source.levelPolicy(9).toPrecise("14+")).toBe(145);
    expect(source.levelPolicy(9).mismatchUpperOffset).toBeUndefined();
    expect(source.authenticate).toBeUndefined();
    expect(source.images.requireHosting).toBe(true);
    expect(source.parseLegacyRecord).toBeUndefined();
  });
});

describe("CHUNITHM score source", () => {
  it("loads the score source only when a fetch starts and returns its outcome", async () => {
    const outcome = { result: { scores: [] } } as unknown as ScoreFetchOutcome;
    scores.fetch.mockResolvedValue(outcome);
    const context = { game: "chunithm", region: "jp", gameVersion: 9 } as ScoreFetchContext;
    const run = {} as FetchRun;

    const source = GAME_SERVER_MODULES.chunithm.scores;
    expect(source.rejectStoredToken).toBeUndefined();
    expect(scores.loaded).not.toHaveBeenCalled();

    await expect(source.fetch(context, run)).resolves.toBe(outcome);
    expect(scores.loaded).toHaveBeenCalledOnce();
    expect(scores.fetch).toHaveBeenCalledWith(context, run);
  });
});

describe("CHUNITHM reserved profiles", () => {
  it("are not declared, so public lookups never resolve a reserved account", () => {
    expect(GAME_SERVER_MODULES.chunithm.reserved).toBeUndefined();
  });
});

describe("CHUNITHM recent play details", () => {
  it("decodes each play's stored playlog and reads anything else as not fetched", async () => {
    const playlog = { maxCombo: 1, judgments: { justiceCritical: 1, justice: 0, attack: 0, miss: 0 }, notePercentages: { tap: 101, hold: 101, slide: 101, air: 101, flick: 101 } };
    const plays = [playlog, null, { maxCombo: "1" }].map((metadata, index) => ({ recentSongId: BigInt(index), maxSecondaryScore: null, metadata }));

    await expect(GAME_SERVER_MODULES.chunithm.recentDetails(plays)).resolves.toEqual([
      { game: "chunithm", playlog },
      { game: "chunithm", playlog: null },
      { game: "chunithm", playlog: null },
    ]);
  });
});
