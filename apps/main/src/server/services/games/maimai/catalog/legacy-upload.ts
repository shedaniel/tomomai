import { z } from "zod";
import { catalogMetadataSchema } from "@/lib/catalog/chart-metadata";
import { MAIMAI_CODES, chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import { count, noteCountsSchema, smallint, type CatalogChart } from "@/server/services/catalog/ingestion/schema";

const MAIMAI_LEVELS = [
  "1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+",
  "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+",
  "13", "13+", "14", "14+", "15", "15+", "16", "16+",
] as const;

const legacyChart = z.object({
  songName: z.string().min(1), type: z.enum(MAIMAI_CODES.chartType), difficulty: z.enum(MAIMAI_CODES.difficulty),
  artist: z.string(), cover: z.string(), level: z.enum(MAIMAI_LEVELS), levelPrecise: count,
  genre: z.string(), addedVersion: smallint, bpm: count.nullable(),
  noteDesigner: z.string().nullable(),
  noteCounts: noteCountsSchema.nullable(),
  metadata: catalogMetadataSchema.optional(),
});

/** maimai uploads from before chart codes name the chart type `type` and use key strings. */
export function parseLegacyCatalogRecord(input: unknown): CatalogChart | undefined {
  if (typeof input !== "object" || input === null || !("type" in input) || "chartType" in input) return undefined;
  const song = legacyChart.parse(input);
  return {
    game: "maimai",
    songName: song.songName,
    chartType: chartTypeToCode(song.type),
    difficulty: difficultyToCode(song.difficulty),
    artist: song.artist,
    cover: song.cover,
    level: song.level,
    levelPrecise: song.levelPrecise,
    genre: song.genre,
    addedVersion: song.addedVersion,
    bpm: song.bpm ?? undefined,
    noteDesigner: song.noteDesigner ?? undefined,
    noteCounts: song.noteCounts ?? undefined,
    metadata: song.metadata,
  };
}
