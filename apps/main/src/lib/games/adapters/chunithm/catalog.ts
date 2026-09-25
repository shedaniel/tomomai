import type { NoteCounts } from "@/lib/types";
import { catalogChartKey, normalizeCatalogCharts, type CatalogChart } from "@/lib/catalog/normalize-charts";
import { sendDiscordNotice } from "@/server/services/admin/discord-webhooks";
import { requireCatalogValue, runFetchers, type Fetcher, type FetcherDefinition } from "@/server/services/games/catalog-fetcher";
import { asFetcher, choosePendingValue, pendingValue } from "@/server/services/games/catalog-merge";
import { createFillMissingFetcher, createSorterFetcher } from "@/server/services/games/catalog-stages";
import type { CatalogFetchContext, PendingChart } from "../../catalog-types";
import type { CatalogSourceAdapter } from "../../types";
import { fetchOtogeDbCatalog, getOtogeDbSource } from "./otoge-db";

const stages: { name: string; fetcher: Fetcher<PendingChart, CatalogFetchContext> }[] = [
  {
    name: "OtogeDB",
    fetcher: asFetcher(fetchOtogeDbCatalog, {
      key: catalogChartKey,
      artist: chart => pendingValue(chart.artist) ?? "",
      addedVersion: chart => pendingValue(chart.addedVersion),
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
    }),
  },
  {
    name: "Fill Missing",
    fetcher: createFillMissingFetcher<PendingChart, CatalogFetchContext>(catalogChartKey, () => ({ plusOffset: 5 })),
  },
  {
    name: "Sorter",
    fetcher: createSorterFetcher((a, b) => a.songName.localeCompare(b.songName)
      || (pendingValue(a.artist) ?? "").localeCompare(pendingValue(b.artist) ?? "")
      || a.chartType - b.chartType || a.difficulty - b.difficulty),
  },
];

export function getChunithmCatalogPipeline(context: CatalogFetchContext): FetcherDefinition<PendingChart, CatalogFetchContext, CatalogChart> {
  getOtogeDbSource(context.region);
  return {
    fetchers: stages.map(stage => stage.fetcher),
    names: stages.map(stage => stage.name),
    key: catalogChartKey,
    validate(charts, log) {
      const keys = new Set<string>();
      for (const chart of charts) {
        const key = catalogChartKey(chart);
        if (keys.has(key)) throw new Error(`Duplicate catalog chart: ${key}`);
        keys.add(key);
        for (const field of ["artist", "cover", "level", "genre", "addedVersion"] as const) {
          requireCatalogValue(pendingValue(chart[field]), field, key, log);
        }
      }
    },
    complete: chart => normalizeCatalogCharts("chunithm", [chart])[0],
    notify: (title, body, color) => sendDiscordNotice(context.region, `CHUNITHM ${title}`, body, color),
  };
}

export const chunithmCatalogAdapter: CatalogSourceAdapter = {
  configured: true,
  getStages(region) {
    getOtogeDbSource(region);
    return { names: stages.map(stage => stage.name) };
  },
  resolveVersion(region) {
    return getOtogeDbSource(region).version;
  },
  collect(context) {
    return runFetchers(context, getChunithmCatalogPipeline(context));
  },
};
