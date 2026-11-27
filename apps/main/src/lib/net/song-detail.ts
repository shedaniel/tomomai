import "server-only";
import { and, count, eq, inArray, lt, max } from "drizzle-orm";
import type { Region } from "@/lib/games/ids";
import { db } from "@/lib/db";
import { parentSong, songs, userRecentSongs } from "@/lib/db/schema-pg";

export type NetChartPlays = { lastPlayedAt: Date; count: number };

/** The player's stored recent plays of a song's charts, by difficulty code: the latest play and how many we kept. */
export async function fetchNetSongPlays(
  userId: string, region: Region, parentPublicIds: readonly string[], before?: Date,
): Promise<Map<number, NetChartPlays>> {
  if (parentPublicIds.length === 0) return new Map();
  const rows = await db
    .select({ difficultyCode: parentSong.difficulty, lastPlayedAt: max(userRecentSongs.playedAt), count: count() })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(userRecentSongs.userId, userId),
      eq(userRecentSongs.game, "maimai"),
      eq(songs.region, region),
      inArray(parentSong.publicId, [...parentPublicIds]),
      before ? lt(userRecentSongs.playedAt, before) : undefined,
    ))
    .groupBy(parentSong.difficulty);
  return new Map(rows.flatMap(row => row.lastPlayedAt ? [[row.difficultyCode, { lastPlayedAt: row.lastPlayedAt, count: row.count }]] : []));
}
