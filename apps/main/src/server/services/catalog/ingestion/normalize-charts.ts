import type { Logger } from "pino";
import type { CatalogMetadata } from "@/lib/catalog/chart-metadata";
import type { CanonicalGameId } from "@/lib/games/types";
import { hasCode } from "@/lib/games/codes";
import { formatChartLabel } from "@/lib/games/presentation";
import type { CatalogChart, CatalogChartIdentity } from "./schema";
import { value, type PendingChart } from "./types";

export function catalogChartKey(chart: CatalogChartIdentity): string {
  return JSON.stringify([chart.game, chart.songName, chart.chartType, chart.difficulty]);
}

export function compareCatalogCharts(a: CatalogChart, b: CatalogChart): number {
  return a.songName.localeCompare(b.songName) || a.artist.localeCompare(b.artist)
    || a.chartType - b.chartType || a.difficulty - b.difficulty;
}

export function requireCatalogValue<T>(value: T | null | undefined, field: string, chart: CatalogChartIdentity, log: Logger): T {
  if (value === null || value === undefined) {
    const chartLabel = formatChartLabel(chart.game, chart);
    log.error({ chartLabel }, `Value is null or undefined for ${field}`);
    throw new Error(`Value is null or undefined for ${field}: ${chartLabel}`);
  }
  return value;
}

export function completeCatalogChart(chart: PendingChart, log: Logger): CatalogChart {
  const required = <T>(field: string, value: T | undefined) => requireCatalogValue(value, field, chart, log);
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
    if (seen.has(identity)) throw new Error(`Duplicate catalog chart: ${formatChartLabel(game, chart)}`);
    seen.add(identity);
  }
}

/**
 * Estimate flags describe the incoming values, except that a kept confirmed constant is not an estimate.
 * Provenance and note counts the incoming chart lacks stay, like the optional columns.
 */
function mergeMetadata(existing: CatalogMetadata | undefined, incoming: CatalogMetadata | undefined, keepsConstant: boolean): CatalogMetadata | undefined {
  const merged: { [K in keyof Required<CatalogMetadata>]: CatalogMetadata[K] } = {
    levelPreciseEstimated: keepsConstant ? undefined : incoming?.levelPreciseEstimated,
    addedVersionEstimated: incoming?.addedVersionEstimated,
    source: incoming?.source ?? existing?.source,
    noteCounts: incoming?.noteCounts ?? existing?.noteCounts,
  };
  return Object.values(merged).some(entry => entry !== undefined) ? merged : undefined;
}

export function mergeCatalogChart(existing: CatalogChart, incoming: CatalogChart): CatalogChart {
  if (catalogChartKey(existing) !== catalogChartKey(incoming)) throw new Error("Cannot merge different catalog identities");
  const keepsConstant = existing.level === incoming.level &&
    incoming.metadata?.levelPreciseEstimated === true && existing.metadata?.levelPreciseEstimated !== true;
  return {
    ...existing, ...incoming,
    levelPrecise: keepsConstant ? existing.levelPrecise : incoming.levelPrecise,
    bpm: incoming.bpm ?? existing.bpm,
    noteDesigner: incoming.noteDesigner ?? existing.noteDesigner,
    noteCounts: incoming.noteCounts ?? existing.noteCounts,
    metadata: mergeMetadata(existing.metadata, incoming.metadata, keepsConstant),
  };
}
