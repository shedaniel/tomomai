import type { Logger } from "pino";
import { resolveGameContext } from "@/lib/games/access";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import type { CatalogSource } from "@/server/services/games/types";
import { fillMissingStage } from "./levels";
import { catalogChartKey, compareCatalogCharts } from "./normalize-charts";
import { runFetchers } from "./runner";
import type { CatalogChart } from "./schema";
import type { CatalogCollectContext, PendingChart } from "./types";

export function catalogRequiresToken(game: CanonicalGameId, region: Region): boolean {
  return GAME_SERVER_MODULES[game].catalog.requiresToken?.(region) ?? false;
}

/** Logs in to the game's catalog source when the region needs it, and returns the session cookies. */
export async function authenticateCatalogSource(game: CanonicalGameId, region: Region, token: string | null): Promise<string> {
  if (!catalogRequiresToken(game, region)) return "";
  if (!token) throw new Error("Missing 'token' query parameter");
  const { authenticate } = GAME_SERVER_MODULES[game].catalog;
  if (!authenticate) throw new Error("Catalog authentication is not configured");
  return authenticate(region, token);
}

function validateTitles(normalizeTitle: NonNullable<CatalogSource["normalizeTitle"]>) {
  return (charts: PendingChart[], log: Logger) => {
    for (const chart of charts) {
      if (chart.songName !== normalizeTitle(chart.songName)) {
        log.error({ songKey: catalogChartKey(chart) }, "Song name does not match normalized name");
      }
    }
  };
}

/** Runs the game's source stages for a region, fills missing constants, and returns the completed charts in catalog order. */
export async function collectCatalog(game: CanonicalGameId, context: CatalogCollectContext): Promise<CatalogChart[]> {
  resolveGameContext(game, { region: context.region, capability: "catalog", regionPolicy: "supported" });
  const source = GAME_SERVER_MODULES[game].catalog;
  const charts = await runFetchers(context, {
    game,
    stages: [...await source.stages(context.region), fillMissingStage(source.levelPolicy(context.version))],
    validate: source.normalizeTitle && validateTitles(source.normalizeTitle),
  });
  return charts.sort(compareCatalogCharts);
}
