import { db } from "@/lib/db";
import { songs, userScores } from "@/lib/db/schema-pg";
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
  const allSongs = await db
    .select({
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      achievement: userScores.achievement,
      fc: userScores.fc,
      fs: userScores.fs,
      dxScore: userScores.dxScore,
    })
    .from(songs)
    .leftJoin(
      userScores,
      and(
        eq(userScores.songId, songs.id),
        eq(userScores.snapshotId, snapshotInternalId)
      )
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
