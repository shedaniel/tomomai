import { z } from "zod";
import { CHART_TYPE_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM } from "@/lib/db/types";
import { gameIdSchema } from "@/lib/games/schema";
import type { CanonicalGameId } from "@/lib/games/types";
import { normalizeCatalogCharts } from "./normalize-charts";

const count = z.number().int().nonnegative();
const notes = z.object({ tap: count, hold: count, slide: count, touch: count, break: count });
const pending = <T extends z.ZodType>(schema: T) => z.union([schema, z.object({ important: z.boolean(), value: schema })]);
const chart = z.object({
  game: gameIdSchema, songName: z.string(), chartType: count, difficulty: count,
  artist: pending(z.string()).optional(), cover: pending(z.string()).optional(),
  level: pending(z.string()).optional(), levelPrecise: pending(count).optional(),
  genre: pending(z.string()).optional(), addedVersion: pending(z.number().int().nullable()).optional(),
  bpm: pending(count).optional(), noteDesigner: pending(z.string()).optional(),
  noteCounts: pending(notes).optional(), metadata: pending(z.record(z.string(), z.unknown())).optional(),
});
const legacyChart = z.object({
  songName: z.string(), type: z.enum(CHART_TYPE_ENUM), difficulty: z.enum(DIFFICULTY_ENUM),
  artist: z.string(), cover: z.string(), level: z.enum(LEVEL_ENUM), levelPrecise: count,
  genre: z.string(), addedVersion: z.number().int(), bpm: count.nullable(),
  noteDesigner: z.string().nullable(), noteCounts: notes.nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function parseCatalogUpload(game: CanonicalGameId, input: unknown) {
  const records = z.array(z.unknown()).nonempty().parse(input);
  const parsed = await Promise.all(records.map(async record => {
    if (game === "maimai" && typeof record === "object" && record !== null && "type" in record && !("chartType" in record)) {
      const { toPendingChart } = await import("@/lib/games/adapters/maimai/catalog");
      return toPendingChart(legacyChart.parse(record));
    }
    return chart.parse(record);
  }));
  return normalizeCatalogCharts(game, parsed);
}
