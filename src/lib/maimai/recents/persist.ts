import { db } from "../../db";
import { userRecentSongs } from "../../db/schema-pg";
import { logger } from "../../logger";
import type { RecentSongData } from "../types";

export async function insertUserRecentSongs(
  userId: string,
  recentSongsData: RecentSongData[],
  songLookup: Map<string, bigint>,
): Promise<void> {
  logger.info(`Starting user recent songs insertion for user ${userId}, ${recentSongsData.length} records`);

  if (recentSongsData.length === 0) {
    logger.debug("No recent songs to insert");
    return;
  }

  const recentSongInserts: (typeof userRecentSongs.$inferInsert)[] = [];
  const notFoundSongs: RecentSongData[] = [];

  for (const recentSong of recentSongsData) {
    try {
      const lookupKey = `${recentSong.songName}|${recentSong.difficulty}|${recentSong.musicType}`;
      const songId = songLookup.get(lookupKey);

      if (!songId) {
        logger.warn(`Could not find song in database: ${recentSong.songName} (${recentSong.difficulty}, ${recentSong.musicType})`);
        notFoundSongs.push(recentSong);
        continue;
      }

      recentSongInserts.push({
        userId: userId,
        songId: songId,
        playedAt: recentSong.playedAt,
        archievement: recentSong.achievement, // Note: typo in schema "archievement"
        dxScore: recentSong.dxScore,
        maxDxScore: recentSong.maxDxScore,
        fc: recentSong.fc,
        fs: recentSong.fs,
        track: recentSong.track,
      });
    } catch (error) {
      logger.error(error, `Error processing recent song: ${recentSong.songName}`);
    }
  }

  logger.debug(`Prepared ${recentSongInserts.length} recent song inserts, ${notFoundSongs.length} songs not found`);

  if (recentSongInserts.length === 0) {
    logger.warn("No valid recent songs to insert");
    return;
  }

  // Unique constraint on (userId, songId, playedAt) handles dup detection
  await db
    .insert(userRecentSongs)
    .values(recentSongInserts)
    .onConflictDoNothing();

  logger.info(`Processed ${recentSongInserts.length} recent song records (duplicates automatically skipped)`);
}
