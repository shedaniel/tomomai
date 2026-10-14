import "server-only";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { userRecentSongs } from "@/lib/db/schema-pg";

/** A recent play's chart instance and result codes. Select it from user_recent_songs joined to songs and parent_song. */
export const maimaiRecentPlayColumns = {
  playedAt: userRecentSongs.playedAt,
  songId: songInstanceId,
  scoreValue: userRecentSongs.scoreValue,
  secondaryScore: userRecentSongs.secondaryScore,
  comboStatus: userRecentSongs.comboStatus,
  syncStatus: userRecentSongs.syncStatus,
};
