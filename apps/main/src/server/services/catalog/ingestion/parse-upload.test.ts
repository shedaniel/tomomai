import { describe, expect, it } from "vitest";
import { parseCatalogUpload } from "./parse-upload";

const chart = {
  game: "chunithm", songName: "Chart", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "cover.png", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8,
};

describe("catalog upload boundary", () => {
  it("keeps zero constants and negative versions and strips uploaded database identities", () => {
    expect(parseCatalogUpload("chunithm", [{ ...chart,
      levelPrecise: 0, addedVersion: -12,
      extras: { dbId: "1", parentId: "2" }, metadata: { source: { provider: "otoge-db", id: "42" } },
    }])).toEqual([{ ...chart, levelPrecise: 0, addedVersion: -12, metadata: { source: { provider: "otoge-db", id: "42" } } }]);
  });

  it("accepts legacy maimai records through the same completed contract", () => {
    const { game, chartType, ...fields } = chart;
    expect(parseCatalogUpload("maimai", [{ ...fields, type: "std", difficulty: "master", bpm: null, noteDesigner: null, noteCounts: null }]))
      .toEqual([{ ...fields, game: "maimai", chartType: 0, difficulty: 3, bpm: undefined, noteDesigner: undefined, noteCounts: undefined, metadata: undefined }]);
  });

  it.each([
    ["an unknown source record", { otogeDb: { id: "42" } }],
    ["a false estimate flag", { levelPreciseEstimated: false }],
    ["another provider", { source: { provider: "lxns", id: "42" } }],
  ])("rejects metadata with %s", (_name, metadata) => {
    expect(() => parseCatalogUpload("chunithm", [{ ...chart, metadata }])).toThrow();
  });

  it("rejects values still wrapped the way collection marks them important", () => {
    expect(() => parseCatalogUpload("chunithm", [{ ...chart, levelPrecise: { important: true, value: 145 } }])).toThrow();
  });

  it.each(["artist", "cover", "level", "levelPrecise", "genre", "addedVersion"] as const)("rejects missing %s", field => {
    expect(() => parseCatalogUpload("chunithm", [{ ...chart, [field]: undefined }])).toThrow();
  });

  it.each([NaN, Infinity, -1, 32768, 145.5])("rejects invalid constant %s", levelPrecise => {
    expect(() => parseCatalogUpload("chunithm", [{ ...chart, levelPrecise }])).toThrow();
  });

  it("rejects cross-game, unsupported-code and duplicate records before ingestion", () => {
    expect(() => parseCatalogUpload("maimai", [chart])).toThrow("different game");
    expect(() => parseCatalogUpload("chunithm", [{ ...chart, difficulty: 42 }])).toThrow("Unknown chart codes");
    expect(() => parseCatalogUpload("chunithm", [chart, { ...chart, levelPrecise: 141 }])).toThrow("Duplicate catalog chart: Chart ULTIMA");
    expect(() => parseCatalogUpload("chunithm", [])).toThrow();
  });

  it("accepts charts that share a key but differ in artist or version, and charts that differ only in chart type", () => {
    expect(parseCatalogUpload("chunithm", [chart, { ...chart, artist: "Another artist" }, { ...chart, addedVersion: 9 }, { ...chart, difficulty: 3 }]))
      .toHaveLength(4);
    const maimai = { ...chart, game: "maimai", difficulty: 3 };
    expect(parseCatalogUpload("maimai", [maimai, { ...maimai, chartType: 1 }])).toHaveLength(2);
  });

  it("requires the game's normalized titles, and keeps source titles for a game without a rule", () => {
    const maimai = { ...chart, game: "maimai", difficulty: 3 };
    expect(() => parseCatalogUpload("maimai", [{ ...maimai, songName: "Ｌｉｎｋ" }])).toThrow("Song title is not normalized: Ｌｉｎｋ STD MASTER");
    expect(parseCatalogUpload("chunithm", [{ ...chart, songName: "ネ！コ！" }])[0].songName).toBe("ネ！コ！");
  });
});
