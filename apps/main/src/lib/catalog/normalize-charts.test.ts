import { describe, expect, it } from "vitest";
import { mergeCatalogChart, normalizeCatalogCharts } from "./normalize-charts";
import type { PendingChart } from "@/lib/games/catalog-types";

const chart: PendingChart = {
  game: "chunithm", songName: "Chart", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "cover.png", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8,
  metadata: { otogeDb: { id: "1", air: 23 } },
};

describe("numeric catalog normalization", () => {
  it("keeps completed constants, introduction versions and provenance", () => {
    expect(normalizeCatalogCharts("chunithm", [chart])[0]).toMatchObject({
      difficulty: 4, level: "14+", levelPrecise: 145, addedVersion: 8,
      metadata: { otogeDb: { id: "1", air: 23 } },
    });
  });

  it("retains maimai codes, pending values and zero-valued constants", () => {
    const [normalized] = normalizeCatalogCharts("maimai", [{ ...chart, game: "maimai", chartType: 1, difficulty: 5,
      levelPrecise: { important: true, value: 0 }, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 },
    }]);
    expect(normalized).toMatchObject({ chartType: 1, difficulty: 5, levelPrecise: 0, addedVersion: -12,
      noteCounts: { tap: 1, hold: 2, slide: 3, touch: 0, break: 0 } });
  });

  it("rejects cross-game, invalid, duplicate and incomplete charts", () => {
    expect(() => normalizeCatalogCharts("maimai", [chart])).toThrow("different game");
    expect(() => normalizeCatalogCharts("chunithm", [{ ...chart, difficulty: 42 }])).toThrow("Unknown chart codes");
    expect(() => normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: NaN }])).toThrow();
    expect(() => normalizeCatalogCharts("chunithm", [{ ...chart, artist: undefined }])).toThrow();
    expect(() => normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: undefined }])).toThrow();
    expect(() => normalizeCatalogCharts("chunithm", [{ ...chart, addedVersion: undefined }])).toThrow();
    expect(() => normalizeCatalogCharts("chunithm", [chart, chart])).toThrow("Duplicate catalog chart");
  });

  it("never trusts uploaded database identities", () => {
    const [known] = normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: 149, addedVersion: 8 }]);
    const [incoming] = normalizeCatalogCharts("chunithm", [{ ...chart, extras: { dbId: "999", parentId: "888" } }]);
    const existing = { ...known, extras: { dbId: "1", parentId: "2" } };
    expect(incoming.extras).toBeUndefined();
    expect(mergeCatalogChart(existing, incoming)).toMatchObject({ levelPrecise: 145, addedVersion: 8, extras: existing.extras });
    expect(() => mergeCatalogChart(existing, { ...incoming, game: "maimai" })).toThrow("different catalog identities");
  });
});

it("does not replace confirmed constants with same-level estimates, and keeps provenance aligned", () => {
  const [known] = normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: 149, metadata: { levelPreciseEstimated: false } }]);
  const [estimate] = normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: 145, metadata: { levelPreciseEstimated: true } }]);
  expect(mergeCatalogChart(known, estimate)).toMatchObject({ levelPrecise: 149, metadata: { levelPreciseEstimated: false } });
  expect(mergeCatalogChart(estimate, known)).toMatchObject({ levelPrecise: 149, metadata: { levelPreciseEstimated: false } });
  expect(mergeCatalogChart(estimate, { ...known, metadata: undefined }).metadata).not.toHaveProperty("levelPreciseEstimated");
});

it("does not retain stale constants when the display level changes", () => {
  const [known] = normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: 149, metadata: { levelPreciseEstimated: false } }]);
  const [changed] = normalizeCatalogCharts("chunithm", [{ ...chart, level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true } }]);
  expect(mergeCatalogChart(known, changed)).toMatchObject({ level: "15", levelPrecise: 150, metadata: { levelPreciseEstimated: true } });
});
