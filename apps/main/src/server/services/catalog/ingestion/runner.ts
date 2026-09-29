import deepEqual from "deep-equal";
import type { Logger } from "pino";
import type { CanonicalGameId } from "@/lib/games/types";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { catalogChartKey, catalogChartLabel, completeCatalogChart } from "./normalize-charts";
import type { CatalogChart } from "./schema";
import type { CatalogCollectContext, CatalogFetchContext, NoticeSink, PendingChart, SourceChart } from "./types";

export type CatalogStage = {
  name: string;
  run: (context: CatalogFetchContext, charts: SourceChart[]) => Promise<SourceChart[]>;
};

export type FetcherDefinition = {
  game: CanonicalGameId;
  stages: CatalogStage[];
  /** Runs after every stage, with that stage's logger. */
  validate?: (charts: PendingChart[], log: Logger) => void;
};

type Attributed = SourceChart & { addedFetcher: number; modifiedFetchers: number[] };

function createNoticeSink(): NoticeSink {
  const details: string[] = [];
  return { details, addDetail(detail: string) { details.push(detail); } };
}

function summarizeStage(charts: Attributed[], index: number, name: string, chartsBefore: number, elapsed: number, notice: NoticeSink): string {
  const added = charts.filter(chart => chart.addedFetcher === index);
  const modified = charts.filter(chart => chart.addedFetcher !== index && chart.modifiedFetchers.includes(index));
  const netChange = charts.length - chartsBefore;

  const lines = [
    `**${name}**: ${charts.length} songs (${netChange >= 0 ? "+" : ""}${netChange}) — ${elapsed}ms`,
    `+${added.length} added, ~${modified.length} modified`,
  ];
  if (added.length > 0 && added.length < 30) lines.push("Added: " + added.map(catalogChartLabel).join(", "));
  if (modified.length > 0 && modified.length < 30) lines.push("Modified: " + modified.map(catalogChartLabel).join(", "));
  lines.push(...notice.details);
  return lines.join("\n");
}

function attributeSource(previous: Attributed[], next: SourceChart[], index: number): Attributed[] {
  const previousByKey = new Map<string, Attributed>();
  for (const chart of previous) {
    const key = catalogChartKey(chart);
    if (!previousByKey.has(key)) previousByKey.set(key, chart);
  }
  return next.map(chart => {
    const existing = previousByKey.get(catalogChartKey(chart));
    if (!existing) {
      return { ...chart, addedFetcher: index, modifiedFetchers: [index] };
    }
    if (!deepEqual(existing, chart)) {
      return { ...chart, addedFetcher: existing.addedFetcher, modifiedFetchers: [...existing.modifiedFetchers, index] };
    }
    return existing;
  });
}

export async function runFetchers(context: CatalogCollectContext, { game, stages, validate }: FetcherDefinition): Promise<CatalogChart[]> {
  const notify = (title: string, body: string, color: number) => {
    sendDiscordNotice(game, context.region, title, body, color).catch(() => { });
  };
  context.log.info({ region: context.region, version: context.version }, "Starting level fetch pipeline");

  let charts: Attributed[] = [];
  for (const [index, stage] of stages.entries()) {
    const log = context.log.child({ index });
    const notice = createNoticeSink();
    log.info("Fetcher starting...");
    const chartsBefore = charts.length;
    const startTime = Date.now();
    const next = await stage.run({ ...context, log, notice }, charts);
    charts = attributeSource(charts, next, index);
    notify(`Stage ${index + 1}/${stages.length}: ${stage.name}`, summarizeStage(charts, index, stage.name, chartsBefore, Date.now() - startTime, notice), 0x5865F2);
    validate?.(charts, log);
  }

  const completed: CatalogChart[] = [];
  const errors: unknown[] = [];
  for (const chart of charts) {
    try { completed.push(completeCatalogChart(chart, context.log)); }
    catch (err) { errors.push(err); }
  }
  if (errors.length) {
    context.log.error({ errorCount: errors.length, songCount: charts.length }, "Errors occurred during song update");
    throw new AggregateError(errors, "Errors occurred during song update");
  }
  context.log.info({ songCount: charts.length }, "Fetch pipeline completed successfully");
  notify("Fetch pipeline completed", `**Total songs: ${charts.length}** (${stages.length} stages)`, 0x00FF00);
  return completed;
}
