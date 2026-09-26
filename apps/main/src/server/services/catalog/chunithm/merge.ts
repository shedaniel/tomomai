import type { NoteCounts } from "@/lib/types";
import { asFetcher as sourceFetcher, choosePendingValue, type FetcherMode } from "../ingestion/merge";
import { catalogChartKey } from "../ingestion/normalize-charts";
import { value, type CatalogFetchContext, type PendingChart } from "../ingestion/types";

export function asFetcher(source: (context: CatalogFetchContext) => Promise<PendingChart[]>, mode: FetcherMode = "default") {
  return sourceFetcher(source, {
    key: catalogChartKey,
    artist: chart => value(chart.artist) ?? "",
    addedVersion: chart => value(chart.addedVersion),
    merge: (existing, incoming) => ({
      ...existing,
      artist: choosePendingValue<string>(existing.artist, incoming.artist),
      cover: choosePendingValue<string>(existing.cover, incoming.cover),
      level: choosePendingValue<string>(existing.level, incoming.level),
      levelPrecise: choosePendingValue<number>(existing.levelPrecise, incoming.levelPrecise),
      genre: choosePendingValue<string>(existing.genre, incoming.genre),
      addedVersion: choosePendingValue<number>(existing.addedVersion, incoming.addedVersion),
      bpm: choosePendingValue<number>(existing.bpm, incoming.bpm),
      noteDesigner: choosePendingValue<string>(existing.noteDesigner, incoming.noteDesigner),
      noteCounts: choosePendingValue<NoteCounts>(existing.noteCounts, incoming.noteCounts),
      metadata: choosePendingValue<Record<string, unknown>>(existing.metadata, incoming.metadata),
    }),
  }, mode);
}
