import "server-only";
import { getTableColumns, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { maimaiRecentSongDetails } from "@/lib/db/schema-pg";
import type { MaimaiPlaylog } from "@/lib/games/maimai/recent-details";
import type { RecentPlayDetails } from "@/lib/games/recent-details";
import type { StoredRecentPlay } from "../types";

const { recentSongId, ...playlogColumns } = getTableColumns(maimaiRecentSongDetails);

/**
 * The playlog columns of user_recent_songs_detailed. Select them as one nested field of a left join,
 * which reads null for a play whose detail page was not fetched.
 */
export const maimaiPlaylogColumns = playlogColumns;

type PlaylogRow = Omit<typeof maimaiRecentSongDetails.$inferSelect, "recentSongId">;

export function toMaimaiPlaylog(row: PlaylogRow): MaimaiPlaylog {
  return {
    venue: row.venue,
    combo: row.combo,
    maxCombo: row.maxCombo,
    syncScore: row.syncScore,
    maxSyncScore: row.maxSyncScore,
    rating: row.rating,
    ratingChange: row.ratingChange,
    fast: row.fastCount,
    late: row.lateCount,
    notes: {
      tap: { cPerfect: row.tapCPerfect, perfect: row.tapPerfect, great: row.tapGreat, good: row.tapGood, miss: row.tapMiss },
      hold: { cPerfect: row.holdCPerfect, perfect: row.holdPerfect, great: row.holdGreat, good: row.holdGood, miss: row.holdMiss },
      slide: { cPerfect: row.slideCPerfect, perfect: row.slidePerfect, great: row.slideGreat, good: row.slideGood, miss: row.slideMiss },
      touch: { cPerfect: row.touchCPerfect, perfect: row.touchPerfect, great: row.touchGreat, good: row.touchGood, miss: row.touchMiss },
      break: { cPerfect: row.breakCPerfect, perfect: row.breakPerfect, great: row.breakGreat, good: row.breakGood, miss: row.breakMiss },
    },
  };
}

export async function loadMaimaiRecentDetails(plays: readonly StoredRecentPlay[]): Promise<RecentPlayDetails<"maimai">[]> {
  const rows = plays.length === 0 ? [] : await db
    .select({ recentSongId, playlog: playlogColumns })
    .from(maimaiRecentSongDetails)
    .where(inArray(recentSongId, plays.map(play => play.recentSongId)));
  const playlogs = new Map(rows.map(row => [row.recentSongId, toMaimaiPlaylog(row.playlog)]));
  return plays.map(play => ({
    game: "maimai",
    maxDxScore: play.maxSecondaryScore ?? 0,
    playlog: playlogs.get(play.recentSongId) ?? null,
  }));
}
