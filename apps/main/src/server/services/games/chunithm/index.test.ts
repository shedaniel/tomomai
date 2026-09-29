import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { GAME_SERVER_MODULES } from "../registry";
import type { FetchRun } from "../fetch-run";
import type { ScoreFetchContext, ScoreFetchOutcome } from "../types";

const catalog = vi.hoisted(() => ({ loaded: vi.fn(), collect: vi.fn() }));
vi.mock("./catalog/pipeline", () => {
  catalog.loaded();
  return { collectChunithmCatalog: catalog.collect };
});

const scores = vi.hoisted(() => ({ loaded: vi.fn(), fetch: vi.fn() }));
vi.mock("./scores/pipeline", () => {
  scores.loaded();
  return { fetchChunithmScores: scores.fetch };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CHUNITHM catalog source", () => {
  it("loads the catalog pipeline only when collection starts", async () => {
    catalog.collect.mockResolvedValue([]);
    const source = GAME_SERVER_MODULES.chunithm.catalog;
    expect(catalog.loaded).not.toHaveBeenCalled();

    const context = {
      region: "jp" as const,
      version: 9,
      log: pino({ enabled: false }),
      notice: { details: [], addDetail: vi.fn() },
    };
    await expect(source.collect(context)).resolves.toEqual([]);
    expect(catalog.loaded).toHaveBeenCalledOnce();
    expect(catalog.collect).toHaveBeenCalledWith(context);
  });
});

describe("CHUNITHM score source", () => {
  it("loads the player pipeline only when a fetch starts and returns its outcome", async () => {
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
