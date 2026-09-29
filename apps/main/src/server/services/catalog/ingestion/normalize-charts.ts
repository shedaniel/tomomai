import type { Logger } from "pino";
import type { CanonicalGameId } from "@/lib/games/types";
import { hasCode, keyOf } from "@/lib/games/codes";
import type { CatalogChart, CatalogChartIdentity } from "./schema";
import { value, type PendingChart } from "./types";

export function catalogChartKey(chart: CatalogChartIdentity): string {
  return JSON.stringify([chart.game, chart.songName, chart.chartType, chart.difficulty]);
}

/** A readable `name@type@difficulty` name for stage notices. Identity comparisons use catalogChartKey. */
export function catalogChartLabel(chart: CatalogChartIdentity): string {
  return `${chart.songName}@${keyOf(chart.game, "chartType", chart.chartType)}@${keyOf(chart.game, "difficulty", chart.difficulty)}`;
}

export function compareCatalogCharts(a: CatalogChart, b: CatalogChart): number {
  return a.songName.localeCompare(b.songName) || a.artist.localeCompare(b.artist)
    || a.chartType - b.chartType || a.difficulty - b.difficulty;
}

export function requireCatalogValue<T>(value: T | null | undefined, field: string, songKey: string, log: Logger): T {
  if (value === null || value === undefined) {
    log.error({ songKey }, `Value is null or undefined for ${field}`);
    throw new Error(`Value is null or undefined for ${field}`);
  }
  return value;
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
  const seen = new Set<string>();
  for (const chart of charts) {
    if (chart.game !== game) throw new Error("Catalog chart belongs to a different game");
    if (!hasCode(game, "chartType", chart.chartType) || !hasCode(game, "difficulty", chart.difficulty)) {
      throw new Error(`Unknown chart codes for ${game}`);
    }
    // Charts sharing a key are distinct songs when their artist or version differs, as with the two "Link" songs.
    const identity = JSON.stringify([catalogChartKey(chart), chart.artist, chart.addedVersion]);
    if (seen.has(identity)) throw new Error(`Duplicate catalog chart: ${catalogChartKey(chart)}`);
    seen.add(identity);
  }
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
  };
}
