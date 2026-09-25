import { describe, expect, it } from "vitest";
import { mergeCatalogChart, normalizeCatalogCharts } from "./normalize-charts";
import type { PendingChart } from "@/lib/games/catalog-types";

const chart: PendingChart = {
  game: "chunithm", songName: "Chart", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "cover.png", genre: "Original", level: "14+",
  metadata: { otogeDb: { id: "1", air: 23 } },
};

describe("numeric catalog normalization", () => {
  it("keeps display-only charts and provenance without fabricating constants or versions", () => {
    expect(normalizeCatalogCharts("chunithm", [chart])[0]).toMatchObject({
      difficulty: 4, level: "14+", levelPrecise: null, addedVersion: null,
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
    expect(() => normalizeCatalogCharts("chunithm", [chart, chart])).toThrow("Duplicate catalog chart");
  });

  it("preserves known enrichment on partial refresh and never trusts uploaded database identities", () => {
    const [known] = normalizeCatalogCharts("chunithm", [{ ...chart, levelPrecise: 149, addedVersion: 8 }]);
    const [incoming] = normalizeCatalogCharts("chunithm", [{ ...chart, extras: { dbId: "999", parentId: "888" } }]);
    const existing = { ...known, extras: { dbId: "1", parentId: "2" } };
    expect(incoming.extras).toBeUndefined();
    expect(mergeCatalogChart(existing, incoming)).toMatchObject({ levelPrecise: 149, addedVersion: 8, extras: existing.extras });
    expect(() => mergeCatalogChart(existing, { ...incoming, game: "maimai" })).toThrow("different catalog identities");
  });
});
