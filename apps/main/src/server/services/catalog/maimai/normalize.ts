import { z } from "zod";
import { MAIMAI_CODES, chartTypeToCode, difficultyToCode } from "@/lib/maimai/codes";
import type { UpdateSong } from "@/server/services/catalog/maimai/types";
import type { CatalogChart } from "../ingestion/normalize-charts";

export function toCatalogChart(song: UpdateSong): CatalogChart {
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
    bpm: song.bpm === null ? undefined : song.bpm,
    noteDesigner: song.noteDesigner === null ? undefined : song.noteDesigner,
    noteCounts: song.noteCounts === null ? undefined : song.noteCounts,
    metadata: song.metadata,
  };
}

const MAIMAI_LEVELS = [
  "1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+",
  "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+",
  "13", "13+", "14", "14+", "15", "15+", "16", "16+",
] as const;

const smallint = z.number().int().min(-32768).max(32767);
const count = smallint.nonnegative();
const legacyChart = z.object({
  songName: z.string().min(1), type: z.enum(MAIMAI_CODES.chartType), difficulty: z.enum(MAIMAI_CODES.difficulty),
  artist: z.string(), cover: z.string(), level: z.enum(MAIMAI_LEVELS), levelPrecise: count,
  genre: z.string(), addedVersion: smallint, bpm: count.nullable(),
  noteDesigner: z.string().nullable(),
  noteCounts: z.object({ tap: count, hold: count, slide: count, touch: count, break: count }).nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function parseLegacyCatalogChart(input: unknown): CatalogChart {
  return toCatalogChart(legacyChart.parse(input));
}
