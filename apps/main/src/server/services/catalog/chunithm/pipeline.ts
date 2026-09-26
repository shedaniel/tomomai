import { catalogChartKey, completeCatalogChart, type CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import { sendDiscordNotice } from "@/server/services/catalog/notifications";
import { runFetchers, type Fetcher, type FetcherDefinition } from "@/server/services/catalog/ingestion/runner";
import { createFillMissingFetcher, createSorterFetcher } from "@/server/services/catalog/ingestion/stages";
import { parseDisplayLevel } from "../ingestion/levels";
import { value, type CatalogFetchContext, type PendingChart } from "../ingestion/types";
import type { CatalogSourceAdapter } from "@/lib/games/types";
import { OtogeDbFetcher, getOtogeDbSource } from "./sources/otoge-db";

const stages: { name: string; fetcher: Fetcher<PendingChart, CatalogFetchContext> }[] = [
  {
    name: "OtogeDB",
    fetcher: OtogeDbFetcher,
  },
  {
    name: "Fill Missing",
    fetcher: createFillMissingFetcher<PendingChart, CatalogFetchContext>(catalogChartKey, () => ({
      toPrecise: level => parseDisplayLevel(level, 5),
    })),
  },
  {
    name: "Sorter",
    fetcher: createSorterFetcher((a, b) => a.songName.localeCompare(b.songName)
      || (value(a.artist) ?? "").localeCompare(value(b.artist) ?? "")
      || a.chartType - b.chartType || a.difficulty - b.difficulty),
  },
];

export function getChunithmCatalogPipeline(context: CatalogFetchContext): FetcherDefinition<PendingChart, CatalogFetchContext, CatalogChart> {
  getOtogeDbSource(context.region);
  return {
    fetchers: stages.map(stage => stage.fetcher),
    names: stages.map(stage => stage.name),
    key: catalogChartKey,
    complete: (chart, context) => completeCatalogChart(chart, context.log),
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
