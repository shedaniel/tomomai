import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillMissingCatalogLevel } from "@/server/services/catalog/ingestion/levels";
import { GAME_SERVER_MODULES } from "../registry";
import type { FetchRun } from "../fetch-run";
import type { ScoreFetchContext, ScoreFetchOutcome } from "../types";

const maimaiCatalog = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock("./catalog/pipeline", async importOriginal => {
  maimaiCatalog.loaded();
  return importOriginal();
});

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

describe("maimai catalog source", () => {
  const source = GAME_SERVER_MODULES.maimai.catalog;

  it("loads the source stages only when they are requested, and reads CN from Lxns alone", async () => {
    expect(maimaiCatalog.loaded).not.toHaveBeenCalled();
    expect((await source.stages("cn")).map(stage => stage.name)).toEqual(["Lxns"]);
    expect((await source.stages("jp")).map(stage => stage.name)).toEqual([
      "Maimai Scraper", "Maimai Base Songs", "DxData", "Fallback", "OtogeDB", "Maimai After Fetch",
    ]);
    expect(maimaiCatalog.loaded).toHaveBeenCalledOnce();
  });

  it("estimates plus levels by version and repairs implausible constants", () => {
    expect(fillMissingCatalogLevel("14+", undefined, source.levelPolicy(9)).levelPrecise).toBe(146);
    expect(fillMissingCatalogLevel("14+", undefined, source.levelPolicy(8)).levelPrecise).toBe(147);
    expect(fillMissingCatalogLevel("14", 149, source.levelPolicy(9))).toEqual({ levelPrecise: 140, estimated: true, reason: "mismatched" });
    expect(fillMissingCatalogLevel("6", 69, source.levelPolicy(9))).toEqual({ levelPrecise: 69, estimated: false });
  });

  it("decodes legacy upload records and leaves current ones to the shared schema", () => {
    const legacy = {
      songName: "Link", type: "std", difficulty: "master", artist: "Artist", cover: "cover.png", level: "13+", levelPrecise: 137,
      genre: "maimai", addedVersion: -12, bpm: null, noteDesigner: null, noteCounts: null,
    };
    const { type: _type, ...fields } = legacy;
    expect(source.parseLegacyRecord?.(legacy)).toEqual({ ...fields, game: "maimai", chartType: 0, difficulty: 3, bpm: undefined, noteDesigner: undefined, noteCounts: undefined });
    expect(source.parseLegacyRecord?.({ ...legacy, chartType: 0 })).toBeUndefined();
    expect(() => source.parseLegacyRecord?.({ ...legacy, level: "13.7" })).toThrow();
  });
});

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
