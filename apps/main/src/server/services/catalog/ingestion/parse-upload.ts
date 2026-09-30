import { z } from "zod";
import { hasCode } from "@/lib/games/codes";
import { formatChartLabel } from "@/lib/games/presentation";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { catalogChartKey } from "./normalize-charts";
import { catalogChartSchema, type CatalogChart } from "./schema";

function validateCatalogCharts(game: CanonicalGameId, charts: CatalogChart[]): void {
  const { normalizeCatalogTitle } = getGame(game);
  const seen = new Set<string>();
  for (const chart of charts) {
    if (chart.game !== game) throw new Error("Catalog chart belongs to a different game");
    if (!hasCode(game, "chartType", chart.chartType) || !hasCode(game, "difficulty", chart.difficulty)) {
      throw new Error(`Unknown chart codes for ${game}`);
    }
    // The admin normalize route renames parents with the same rule, so a stored title always matches its next collection.
    if (normalizeCatalogTitle && chart.songName !== normalizeCatalogTitle(chart.songName)) {
      throw new Error(`Song title is not normalized: ${formatChartLabel(game, chart)}`);
    }
    // Charts sharing a key are distinct songs when their artist or version differs, as with the two "Link" songs.
    const identity = JSON.stringify([catalogChartKey(chart), chart.artist, chart.addedVersion]);
    if (seen.has(identity)) throw new Error(`Duplicate catalog chart: ${formatChartLabel(game, chart)}`);
    seen.add(identity);
  }
}

/** The catalog upload contract: complete charts of one game with known codes, normalized titles and no duplicates. */
export function parseCatalogUpload(game: CanonicalGameId, input: unknown): CatalogChart[] {
  const records = z.array(z.unknown()).nonempty().parse(input);
  const { parseLegacyRecord } = GAME_SERVER_MODULES[game].catalog;
  const charts = records.map(record => parseLegacyRecord?.(record) ?? catalogChartSchema.parse(record));
  validateCatalogCharts(game, charts);
  return charts;
}
