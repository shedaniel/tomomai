import { requireMaimaiConstant } from "@/lib/games/adapters/maimai/chart";
import type { CanonicalGameId } from "@/lib/games/types";
import { requireMaimaiQuery } from "./game-scope";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, difficultyToCode } from "@/lib/maimai/codes";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs } from "@/lib/db/schema-pg";
import { and, eq, sql } from "drizzle-orm";
import type { Difficulty, Region, MinimalSongForDisplay } from "@/lib/types";

export async function fetchPlateSongs(
  snapshotInternalId: number,
  gameVersion: number,
  region: Region,
  version: string,
  difficulty: Difficulty,
  plateType: "kiwami" | "shou" | "shin" | "maimai"
): Promise<MinimalSongForDisplay[]> {
  const snapshotScoresSub = db
    .select({
      songId: scoreData.songId,
      achievement: scoreData.scoreValue,
      fc: sql`${scoreData.comboStatus}`.mapWith(codeToComboStatus).as("fc"),
      fs: sql`${scoreData.syncStatus}`.mapWith(codeToSyncStatus).as("fs"),
      dxScore: scoreData.secondaryScore,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .where(and(eq(snapshotScores.game, "maimai"), eq(snapshotScores.snapshotId, snapshotInternalId)))
    .as("snapshot_scores_sub");

  const allSongs = await db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficulty: sql`${parentSong.difficulty}`.mapWith(codeToDifficulty).as("difficulty"),
      levelPrecise: songs.levelPrecise,
      type: sql`${parentSong.type}`.mapWith(codeToChartType).as("type"),
      achievement: snapshotScoresSub.achievement,
      fc: snapshotScoresSub.fc,
      fs: snapshotScoresSub.fs,
      dxScore: snapshotScoresSub.dxScore,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(
      snapshotScoresSub,
      eq(snapshotScoresSub.songId, songs.id)
    )
    .where(
      and(
        eq(songs.addedVersion, parseInt(version)),
        eq(parentSong.difficulty, difficultyToCode(difficulty)),
        and(eq(songs.game, "maimai"), eq(songs.region, region)),
        eq(songs.gameVersion, gameVersion)
      )
    );

  const filteredSongs = allSongs.filter((song) => {
    const achievement = song.achievement || 0;
    const fc = song.fc || "none";
    const fs = song.fs || "none";

    switch (plateType) {
      case "kiwami":
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
    levelPrecise: requireMaimaiConstant(song.levelPrecise),
    achievement: song.achievement || 0,
    fc: song.fc || "none",
    fs: song.fs || "none",
    dxScore: song.dxScore || 0,
  } satisfies MinimalSongForDisplay));
}

export function fetchPlateSongsForGame(game: CanonicalGameId, ...args: Parameters<typeof fetchPlateSongs>) {
  requireMaimaiQuery(game, args[2], "plates");
  return fetchPlateSongs(...args);
}
