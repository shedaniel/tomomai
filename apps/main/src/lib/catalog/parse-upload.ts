import { z } from "zod";
import { parseLegacyCatalogChart } from "@/server/services/games/maimai/catalog/normalize";
import { gameIdSchema } from "@/lib/games/schema";
import type { CanonicalGameId } from "@/lib/games/types";
import { validateCatalogCharts, type CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import { value } from "@/server/services/catalog/ingestion/types";

const smallint = z.number().int().min(-32768).max(32767);
const count = smallint.nonnegative();
const notes = z.object({ tap: count, hold: count, slide: count, touch: count, break: count });
const pending = <T>(schema: z.ZodType<T>) => z.union([schema, z.object({ important: z.boolean(), value: schema })]).transform(input => value<T>(input));
const chart = z.object({
  game: gameIdSchema, songName: z.string().min(1), chartType: count, difficulty: count,
  artist: pending(z.string()), cover: pending(z.string()),
  level: pending(z.string().min(1)), levelPrecise: pending(count),
  genre: pending(z.string()), addedVersion: pending(smallint),
  bpm: pending(count).optional(), noteDesigner: pending(z.string()).optional(),
  noteCounts: pending(notes).optional(), metadata: pending(z.record(z.string(), z.unknown())).optional(),
});

export function parseCatalogUpload(game: CanonicalGameId, input: unknown): CatalogChart[] {
  const records = z.array(z.unknown()).nonempty().parse(input);
  const parsed = records.map(record => {
    if (game === "maimai" && typeof record === "object" && record !== null && "type" in record && !("chartType" in record)) {
      return parseLegacyCatalogChart(record);
    }
    return chart.parse(record);
  });
  validateCatalogCharts(game, parsed);
  return parsed;
}
