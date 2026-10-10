import { describe, expect, it } from "vitest";
import pino from "pino";
import { completeCatalogChart, mergeCatalogChart } from "./normalize-charts";
import type { CatalogChart } from "./schema";

const log = pino({ enabled: false });
const chart: CatalogChart = {
  game: "chunithm", songName: "Chart", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "cover.png", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8,
  metadata: { source: { provider: "otoge-db", id: "1" }, noteCounts: { air: 23 } },
};
const source = { provider: "otoge-db", id: "1" } as const;

describe("catalog completion", () => {
  it("unwraps completed fields without losing zero constants or negative versions", () => {
    const completed = completeCatalogChart({ ...chart, game: "maimai", chartType: 1, difficulty: 5,
      levelPrecise: { important: true, value: 0 }, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 },
    }, log);
    expect(completed).toMatchObject({ levelPrecise: 0, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 }, metadata: chart.metadata });
  });
});

describe("catalog merging", () => {
  it("takes the incoming values and rejects different chart identities", () => {
    const existing = { ...chart, levelPrecise: 149 };
    expect(mergeCatalogChart(existing, chart)).toEqual(chart);
    expect(() => mergeCatalogChart(existing, { ...chart, game: "maimai" })).toThrow("different catalog identities");
  });

  it("keeps a confirmed constant over a same-level estimate, and lets a confirmed constant replace an estimate", () => {
    const known: CatalogChart = { ...chart, levelPrecise: 149, metadata: { source } };
    const estimate: CatalogChart = { ...chart, metadata: { levelPreciseEstimated: true, source } };
    expect(mergeCatalogChart(known, estimate)).toEqual(known);
    expect(mergeCatalogChart(estimate, known)).toEqual(known);
    expect(mergeCatalogChart(estimate, { ...known, metadata: undefined }).metadata).toEqual({ source });
  });

  it("does not retain stale constants when the display level changes", () => {
    const known: CatalogChart = { ...chart, levelPrecise: 149, metadata: { source } };
    const changed: CatalogChart = { ...chart, level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true } };
    expect(mergeCatalogChart(known, changed)).toMatchObject({ level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true, source } });
  });

  it("takes estimate flags from the incoming chart and keeps the provenance and note counts it lacks", () => {
    const stored: CatalogChart = { ...chart, metadata: { addedVersionEstimated: true, source, noteCounts: { tap: 1 } } };
    expect(mergeCatalogChart(stored, { ...chart, metadata: { noteCounts: { tap: 2 } } }).metadata)
      .toEqual({ source, noteCounts: { tap: 2 } });
    expect(mergeCatalogChart({ ...chart, metadata: undefined }, { ...chart, metadata: {} }).metadata).toBeUndefined();
  });
});
