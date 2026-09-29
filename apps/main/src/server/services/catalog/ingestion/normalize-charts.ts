import { value, type PendingChart } from "@/server/services/catalog/ingestion/types";
import type { CanonicalGameId } from "@/lib/games/types";
import type { NoteCounts } from "@/lib/types";
import type { Logger } from "pino";
import { hasCode } from "@/lib/games/codes";
import { findDuplicateUpload } from "@/server/services/catalog/ingestion/match-upload";
import { requireCatalogValue } from "@/server/services/catalog/ingestion/runner";

export type CatalogChart = {
  game: CanonicalGameId;
  songName: string;
  chartType: number;
  difficulty: number;
  artist: string;
  cover: string;
  level: string;
  levelPrecise: number;
  genre: string;
  addedVersion: number;
  bpm?: number;
  noteDesigner?: string;
  noteCounts?: NoteCounts;
  metadata?: Record<string, unknown>;
  extras?: Record<string, unknown>;
};

export function catalogChartKey(chart: Pick<CatalogChart, "game" | "songName" | "chartType" | "difficulty">): string {
  return JSON.stringify([chart.game, chart.songName, chart.chartType, chart.difficulty]);
}

export function completeCatalogChart(chart: PendingChart, log: Logger): CatalogChart {
  const required = <T>(field: string, value: T | undefined) => requireCatalogValue(value, field, catalogChartKey(chart), log);
  return {
    game: chart.game,
    songName: chart.songName,
    chartType: chart.chartType,
    difficulty: chart.difficulty,
    artist: required("artist", value(chart.artist)),
    cover: required("cover", value(chart.cover)),
    level: required("level", value(chart.level)),
    levelPrecise: required("levelPrecise", value(chart.levelPrecise)),
    genre: required("genre", value(chart.genre)),
    addedVersion: required("addedVersion", value(chart.addedVersion)),
    bpm: value(chart.bpm),
    noteDesigner: value(chart.noteDesigner),
    noteCounts: value(chart.noteCounts),
    metadata: value(chart.metadata),
  };
}

export function validateCatalogCharts(game: CanonicalGameId, charts: CatalogChart[]): void {
  for (const chart of charts) {
    if (chart.game !== game) throw new Error("Catalog chart belongs to a different game");
    if (!hasCode(game, "chartType", chart.chartType) || !hasCode(game, "difficulty", chart.difficulty)) {
      throw new Error(`Unknown chart codes for ${game}`);
    }
  }
  const duplicate = findDuplicateUpload(charts.map(chart => ({ ...chart, type: chart.chartType })));
  if (duplicate !== undefined) throw new Error(`Duplicate catalog chart: ${catalogChartKey(charts[duplicate])}`);
}

export function mergeCatalogChart(existing: CatalogChart, incoming: CatalogChart): CatalogChart {
  if (catalogChartKey(existing) !== catalogChartKey(incoming)) throw new Error("Cannot merge different catalog identities");
  const preserveConstant = existing.level === incoming.level &&
    incoming.metadata?.levelPreciseEstimated === true && existing.metadata?.levelPreciseEstimated !== true;
  const metadata = incoming.metadata === undefined ? existing.metadata : { ...existing.metadata, ...incoming.metadata };
  const mergedMetadata = metadata === undefined ? undefined : { ...metadata };
  if (preserveConstant && mergedMetadata) {
    if (existing.metadata?.levelPreciseEstimated === undefined) delete mergedMetadata.levelPreciseEstimated;
    else mergedMetadata.levelPreciseEstimated = existing.metadata.levelPreciseEstimated;
  } else if (incoming.metadata?.levelPreciseEstimated === undefined && mergedMetadata) {
    delete mergedMetadata.levelPreciseEstimated;
  }
  return {
    ...existing, ...incoming,
    levelPrecise: preserveConstant ? existing.levelPrecise : incoming.levelPrecise,
    bpm: incoming.bpm ?? existing.bpm,
    noteDesigner: incoming.noteDesigner ?? existing.noteDesigner,
    noteCounts: incoming.noteCounts ?? existing.noteCounts,
    metadata: mergedMetadata,
    extras: existing.extras,
  };
}
