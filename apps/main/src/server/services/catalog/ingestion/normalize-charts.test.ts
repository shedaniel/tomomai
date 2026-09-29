import { describe, expect, it } from "vitest";
import pino from "pino";
import { compareCatalogCharts, completeCatalogChart, mergeCatalogChart, validateCatalogCharts, type CatalogChart } from "./normalize-charts";

const log = pino({ enabled: false });
const chart: CatalogChart = {
  game: "chunithm", songName: "Chart", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "cover.png", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8,
  metadata: { otogeDb: { id: "1", air: 23 } },
};

describe("catalog completion", () => {
  it("unwraps completed fields without losing zero constants or negative versions", () => {
    const completed = completeCatalogChart({ ...chart, game: "maimai", chartType: 1, difficulty: 5,
      levelPrecise: { important: true, value: 0 }, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 },
    }, log);
    expect(completed).toMatchObject({ levelPrecise: 0, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 }, metadata: chart.metadata });
  });

  it("requires a resolved introduction version after the final stage", () => {
    expect(() => completeCatalogChart({ ...chart, addedVersion: undefined }, log)).toThrow("addedVersion");
  });
});

describe("catalog validation", () => {
  it("rejects a repeated identity even when other chart fields differ", () => {
    expect(() => validateCatalogCharts("chunithm", [chart, { ...chart, levelPrecise: 141 }])).toThrow("Duplicate catalog chart");
  });

  it("accepts charts that share a key but differ in artist or version", () => {
    expect(() => validateCatalogCharts("chunithm", [
      chart, { ...chart, artist: "Another artist" }, { ...chart, addedVersion: 9 }, { ...chart, difficulty: 3 },
    ])).not.toThrow();
  });
});

describe("catalog order", () => {
  it("sorts by title, artist, chart type and difficulty", () => {
    const charts = [
      { ...chart, difficulty: 3 }, { ...chart, songName: "B" }, { ...chart, artist: "Z" }, chart, { ...chart, songName: "A", difficulty: 5 },
    ];
    expect(charts.toSorted(compareCatalogCharts).map(c => [c.songName, c.artist, c.difficulty])).toEqual([
      ["A", "Artist", 5], ["B", "Artist", 4], ["Chart", "Artist", 3], ["Chart", "Artist", 4], ["Chart", "Z", 4],
    ]);
  });
});

describe("catalog merging", () => {
  it("retains database identities and rejects different chart identities", () => {
    const existing = { ...chart, levelPrecise: 149, extras: { dbId: "1", parentId: "2" } };
    const incoming = { ...chart, extras: { dbId: "999", parentId: "888" } };
    expect(mergeCatalogChart(existing, incoming)).toMatchObject({ levelPrecise: 145, addedVersion: 8, extras: existing.extras });
    expect(() => mergeCatalogChart(existing, { ...incoming, game: "maimai" })).toThrow("different catalog identities");
  });

  it("preserves confirmed constants over same-level estimates with aligned provenance", () => {
    const known = { ...chart, levelPrecise: 149, metadata: { levelPreciseEstimated: false } };
    const estimate = { ...chart, metadata: { levelPreciseEstimated: true } };
    expect(mergeCatalogChart(known, estimate)).toMatchObject({ levelPrecise: 149, metadata: { levelPreciseEstimated: false } });
    expect(mergeCatalogChart(estimate, known)).toMatchObject({ levelPrecise: 149, metadata: { levelPreciseEstimated: false } });
    expect(mergeCatalogChart(estimate, { ...known, metadata: undefined }).metadata).not.toHaveProperty("levelPreciseEstimated");
  });

  it("does not retain stale constants when the display level changes", () => {
    const known = { ...chart, levelPrecise: 149, metadata: { levelPreciseEstimated: false } };
    const changed = { ...chart, level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true } };
    expect(mergeCatalogChart(known, changed)).toMatchObject({ level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true } });
  });
});
