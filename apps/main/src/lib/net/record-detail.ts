import "server-only";
import { and, eq, lt } from "drizzle-orm";
import type { Region } from "@/lib/games/ids";
import { db } from "@/lib/db";
import { maimaiRecentSongDetails, parentSong, songs, userRecentSongs } from "@/lib/db/schema-pg";
import { maimaiPlaylogColumns, toMaimaiPlaylog } from "@/server/services/games/maimai/recent-details";

const RECENT_ID_PATTERN = /^[1-9]\d{0,18}$/;

/**
 * One of a player's maimai recent plays by its id, with its playlog when the detail page was fetched. Null for an
 * id that is not this player's play in this region, or that was played after `before`.
 */
export async function fetchNetRecordDetail(userId: string, region: Region, rawId: string, before?: Date) {
  if (!RECENT_ID_PATTERN.test(rawId)) return null;
  const id = BigInt(rawId);
  const [row] = await db
    .select({
      playedAt: userRecentSongs.playedAt,
      track: userRecentSongs.track,
      scoreValue: userRecentSongs.scoreValue,
      secondaryScore: userRecentSongs.secondaryScore,
      maxSecondaryScore: userRecentSongs.maxSecondaryScore,
      comboStatus: userRecentSongs.comboStatus,
      syncStatus: userRecentSongs.syncStatus,
      parentPublicId: parentSong.publicId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      playlog: maimaiPlaylogColumns,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(maimaiRecentSongDetails, eq(maimaiRecentSongDetails.recentSongId, userRecentSongs.id))
    .where(and(
      eq(userRecentSongs.id, id),
      eq(userRecentSongs.userId, userId),
      eq(userRecentSongs.game, "maimai"),
      eq(songs.region, region),
      before ? lt(userRecentSongs.playedAt, before) : undefined,
    ))
    .limit(1);
  if (!row) return null;
  const { playlog, ...play } = row;
  return { ...play, playlog: playlog ? toMaimaiPlaylog(playlog) : null };
}

export type NetRecordDetail = NonNullable<Awaited<ReturnType<typeof fetchNetRecordDetail>>>;
