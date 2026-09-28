import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { GAME_SERVER_MODULES, requireConfiguredSource } from "../registry";
import type { GameFetchResult, ScoreFetchContext } from "../types";

const catalog = vi.hoisted(() => ({ loaded: vi.fn(), collect: vi.fn() }));
vi.mock("./catalog/pipeline", () => {
  catalog.loaded();
  return { collectCatalog: catalog.collect };
});

const scores = vi.hoisted(() => ({ loaded: vi.fn(), fetchPlayer: vi.fn() }));
vi.mock("./scores/pipeline", () => {
  scores.loaded();
  return { fetchPlayer: scores.fetchPlayer };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CHUNITHM catalog source", () => {
  it("loads the catalog pipeline only when collection starts", async () => {
    catalog.collect.mockResolvedValue([]);
    const source = requireConfiguredSource("chunithm", "catalog");
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
  it("loads the player pipeline only when a fetch starts and returns its result without extras", async () => {
    const result = { scores: [] } as unknown as GameFetchResult;
    scores.fetchPlayer.mockResolvedValue(result);
    const context = { game: "chunithm", region: "jp", gameVersion: 9 } as ScoreFetchContext;

    const source = requireConfiguredSource("chunithm", "scores");
    expect(source.validateToken).toBeUndefined();
    expect(scores.loaded).not.toHaveBeenCalled();

    await expect(source.fetch(context)).resolves.toEqual({ result });
    expect(scores.loaded).toHaveBeenCalledOnce();
    expect(scores.fetchPlayer).toHaveBeenCalledWith(context);
  });
});

describe("CHUNITHM reserved profiles", () => {
  it("are not declared, so public lookups never resolve a reserved account", () => {
    expect(GAME_SERVER_MODULES.chunithm.reserved).toBeUndefined();
  });
});
