import { z } from "zod";
import { gameIdSchema } from "@/lib/games/schema";

export const smallint = z.number().int().min(-32768).max(32767);
export const count = smallint.nonnegative();
export const noteCountsSchema = z.object({ tap: count, hold: count, slide: count, touch: count, break: count });

/** A completed catalog chart, as collection produces it and an upload must provide it. */
export const catalogChartSchema = z.object({
  game: gameIdSchema,
  songName: z.string().min(1),
  chartType: count,
  difficulty: count,
  artist: z.string(),
  cover: z.string(),
  level: z.string().min(1),
  levelPrecise: count,
  genre: z.string(),
  addedVersion: smallint,
  bpm: count.optional(),
  noteDesigner: z.string().optional(),
  noteCounts: noteCountsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CatalogChart = z.infer<typeof catalogChartSchema>;

/** Fields that name a chart. Every other field is data about it. */
export const CATALOG_IDENTITY_FIELDS = ["game", "songName", "chartType", "difficulty"] as const satisfies readonly (keyof CatalogChart)[];
export type CatalogChartIdentity = Pick<CatalogChart, (typeof CATALOG_IDENTITY_FIELDS)[number]>;

/** Fields shared by every region and version of a chart, stored on its parent_song row. */
export const CATALOG_PARENT_FIELDS = ["artist", "cover", "genre", "bpm"] as const satisfies readonly (keyof CatalogChart)[];

/** Fields of one region and version of a chart, stored on its songs row. */
export const CATALOG_INSTANCE_FIELDS = [
  "level", "levelPrecise", "addedVersion", "noteDesigner", "noteCounts", "metadata",
] as const satisfies readonly (keyof CatalogChart)[];
