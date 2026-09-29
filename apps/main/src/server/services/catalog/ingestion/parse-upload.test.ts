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
      extras: { dbId: "1", parentId: "2" }, metadata: { otogeDb: { id: "42" } },
    }])).toEqual([{ ...chart, levelPrecise: 0, addedVersion: -12, metadata: { otogeDb: { id: "42" } } }]);
  });

  it("accepts legacy maimai records through the same completed contract", () => {
    const { game, chartType, ...fields } = chart;
    expect(parseCatalogUpload("maimai", [{ ...fields, type: "std", difficulty: "master", bpm: null, noteDesigner: null, noteCounts: null }]))
      .toEqual([{ ...fields, game: "maimai", chartType: 0, difficulty: 3, bpm: undefined, noteDesigner: undefined, noteCounts: undefined, metadata: undefined }]);
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
    expect(() => parseCatalogUpload("chunithm", [chart, chart])).toThrow("Duplicate catalog chart");
    expect(() => parseCatalogUpload("chunithm", [])).toThrow();
  });
});
