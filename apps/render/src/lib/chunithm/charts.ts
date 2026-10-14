import type { CatalogSong } from "@tomomai/games/catalog-client";
import { definedKeyOf, type CodeKey } from "@tomomai/games/codes";
import type { ChunithmChartRecord, ChunithmRenderHeader } from "@tomomai/render-token";
import { catalogEntry } from "../catalog";

/** A CHUNITHM score joined with its chart's catalog entry, ready to draw. */
export interface ChunithmChart {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  difficulty: CodeKey<"chunithm", "difficulty">;
  level: string;
  /** Chart constant ×10, so 14.5 is 145. */
  levelPrecise: number;
  /** The constant is the catalog's estimate rather than a published one. */
  levelPreciseEstimated: boolean;
  addedVersion: number;
  scoreValue: number;
  comboStatus: CodeKey<"chunithm", "comboStatus">;
  syncStatus: CodeKey<"chunithm", "syncStatus">;
  clearStatus: CodeKey<"chunithm", "clearStatus">;
  /** The chart's rating at this score ×100, so 17.65 is 1765. */
  rating: number;
}

/** The rating breakdown: the player's rated charts from the current version and from earlier ones. */
export interface ChunithmRatingImage {
  header: ChunithmRenderHeader;
  visitableProfileAt: string | null;
  newCharts: ChunithmChart[];
  oldCharts: ChunithmChart[];
}

/** The plays of one JST play day, newest first. */
export interface ChunithmDailyPlaysImage {
  header: ChunithmRenderHeader;
  /** "YYYY-MM-DD" */
  day: string;
  plays: ChunithmChart[];
}

export function joinChunithmChart(catalog: Map<string, CatalogSong<"chunithm">>, record: ChunithmChartRecord): ChunithmChart {
  const entry = catalogEntry(catalog, record.songId);
  return {
    songId: record.songId,
    songName: entry.songName,
    artist: entry.artist,
    cover: entry.cover,
    difficulty: entry.difficulty,
    level: entry.level,
    levelPrecise: entry.levelPrecise,
    levelPreciseEstimated: entry.levelPreciseEstimated === true,
    addedVersion: entry.addedVersion,
    scoreValue: record.scoreValue,
    comboStatus: definedKeyOf("chunithm", "comboStatus", record.comboStatus),
    syncStatus: definedKeyOf("chunithm", "syncStatus", record.syncStatus),
    clearStatus: definedKeyOf("chunithm", "clearStatus", record.clearStatus),
    rating: record.rating,
  };
}
