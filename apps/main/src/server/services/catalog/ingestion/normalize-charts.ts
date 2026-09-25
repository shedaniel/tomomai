import { z } from "zod";
import { pendingValue, type PendingChart } from "@/server/services/catalog/ingestion/types";
import type { CanonicalGameId } from "@/lib/games/types";
import { gameIdSchema } from "@/lib/games/schema";
import { GAME_CODE_MAPS } from "@/lib/games/codes";
import { findDuplicateUpload } from "@/server/services/catalog/ingestion/match-upload";

const smallint = z.number().int().min(-32768).max(32767);
const count = smallint.nonnegative();
const chartSchema = z.object({
  game: gameIdSchema,
  songName: z.string().min(1),
  chartType: count,
  difficulty: count,
  artist: z.string(),
  cover: z.string(),
  level: z.string().min(1),
  levelPrecise: count,
  genre: z.string(),
  addedVersion: smallint,
  bpm: count.optional(),
  noteDesigner: z.string().optional(),
  noteCounts: z.object({ tap: count, hold: count, slide: count, touch: count, break: count }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CatalogChart = z.infer<typeof chartSchema> & { extras?: Record<string, unknown> };

export function catalogChartKey(chart: Pick<CatalogChart, "game" | "songName" | "chartType" | "difficulty">): string {
  return JSON.stringify([chart.game, chart.songName, chart.chartType, chart.difficulty]);
}

export function normalizeCatalogCharts(game: CanonicalGameId, charts: PendingChart[]): CatalogChart[] {
  const normalized = charts.map(chart => {
    const parsed = chartSchema.parse({
      game: chart.game, songName: chart.songName, chartType: chart.chartType, difficulty: chart.difficulty,
      artist: pendingValue(chart.artist), cover: pendingValue(chart.cover), level: pendingValue(chart.level),
      levelPrecise: pendingValue(chart.levelPrecise), genre: pendingValue(chart.genre), addedVersion: pendingValue(chart.addedVersion),
      bpm: pendingValue(chart.bpm), noteDesigner: pendingValue(chart.noteDesigner), noteCounts: pendingValue(chart.noteCounts),
      metadata: pendingValue(chart.metadata),
    });
    if (parsed.game !== game) throw new Error("Catalog chart belongs to a different game");
    const codes = GAME_CODE_MAPS[game];
    if (!(parsed.chartType in codes.chartType) || !(parsed.difficulty in codes.difficulty)) {
      throw new Error(`Unknown chart codes for ${game}`);
    }
    return parsed;
  });
  const duplicate = findDuplicateUpload(normalized.map(chart => ({ ...chart, type: chart.chartType })));
  if (duplicate !== undefined) throw new Error(`Duplicate catalog chart: ${catalogChartKey(normalized[duplicate])}`);
  return normalized;
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
