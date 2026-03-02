import { db } from "@/lib/db";
import { scoreData, snapshotScores, songs } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import type { Difficulty, Region, MinimalSongForDisplay } from "@/lib/types";

export async function fetchPlateSongs(
  snapshotInternalId: number,
  gameVersion: number,
  region: Region,
  version: string,
  difficulty: Difficulty,
  plateType: "kyoku" | "shou" | "shin" | "maimai"
): Promise<MinimalSongForDisplay[]> {
  const snapshotScoresSub = db
    .select({
      songId: scoreData.songId,
      achievement: scoreData.achievement,
      fc: scoreData.fc,
      fs: scoreData.fs,
      dxScore: scoreData.dxScore,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .where(eq(snapshotScores.snapshotId, snapshotInternalId))
    .as("snapshot_scores_sub");

  const allSongs = await db
    .select({
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      achievement: snapshotScoresSub.achievement,
      fc: snapshotScoresSub.fc,
      fs: snapshotScoresSub.fs,
      dxScore: snapshotScoresSub.dxScore,
    })
    .from(songs)
    .leftJoin(
      snapshotScoresSub,
      eq(snapshotScoresSub.songId, songs.id)
    )
    .where(
      and(
        eq(songs.addedVersion, parseInt(version)),
        eq(songs.difficulty, difficulty),
        eq(songs.region, region),
        eq(songs.gameVersion, gameVersion)
      )
    );

  const filteredSongs = allSongs.filter((song) => {
    const achievement = song.achievement || 0;
    const fc = song.fc || "none";
    const fs = song.fs || "none";

    switch (plateType) {
      case "kyoku":
        return !["fc", "fc+", "ap", "ap+"].includes(fc);
      case "shou":
        return achievement < 1000000;
      case "shin":
        return !["ap", "ap+"].includes(fc);
      case "maimai":
        return !["fdx", "fdx+"].includes(fs);
      default:
        return false;
    }
  });

  return filteredSongs.map((song) => ({
    ...song,
    achievement: song.achievement || 0,
    fc: song.fc || "none",
    fs: song.fs || "none",
    dxScore: song.dxScore || 0,
  } satisfies MinimalSongForDisplay));
}
