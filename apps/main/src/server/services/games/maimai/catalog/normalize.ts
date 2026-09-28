import { z } from "zod";
import { MAIMAI_CODES, chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import type { UpdateSong } from "./types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import { MAIMAI_LEVELS } from "./levels";

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
