import { z } from "zod";
import type { CanonicalGameId } from "@/lib/games/types";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { validateCatalogCharts } from "./normalize-charts";
import { catalogChartSchema, type CatalogChart } from "./schema";

export function parseCatalogUpload(game: CanonicalGameId, input: unknown): CatalogChart[] {
  const records = z.array(z.unknown()).nonempty().parse(input);
  const { parseLegacyRecord } = GAME_SERVER_MODULES[game].catalog;
  const charts = records.map(record => parseLegacyRecord?.(record) ?? catalogChartSchema.parse(record));
  validateCatalogCharts(game, charts);
  return charts;
}
