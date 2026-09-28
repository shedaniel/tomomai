import "server-only";
import { catalogChartKey, completeCatalogChart, type CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { runFetchers, type Fetcher } from "@/server/services/catalog/ingestion/runner";
import { createFillMissingFetcher, createSorterFetcher } from "@/server/services/catalog/ingestion/stages";
import { parseDisplayLevel } from "@/server/services/catalog/levels";
import { value, type CatalogFetchContext, type PendingChart } from "@/server/services/catalog/ingestion/types";
import { OtogeDbFetcher } from "./sources/otoge-db";

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

export function collectChunithmCatalog(context: CatalogFetchContext): Promise<CatalogChart[]> {
  return runFetchers(context, {
    fetchers: stages.map(stage => stage.fetcher),
    names: stages.map(stage => stage.name),
    key: catalogChartKey,
    complete: (chart, context) => completeCatalogChart(chart, context.log),
    notify: (title, body, color) => sendDiscordNotice("chunithm", context.region, title, body, color),
  });
}
