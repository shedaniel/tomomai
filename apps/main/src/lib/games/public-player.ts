import { getPlayerRankings, type GameSnapshotData } from "./player-view";
import type { CanonicalGameId } from "./types";

export interface PlayerPrivacy {
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlayCounts: boolean;
}

export function toPublicGameSnapshot(game: CanonicalGameId, data: GameSnapshotData, privacy: PlayerPrivacy): GameSnapshotData {
  const rankings = getPlayerRankings(game, data);
  const visibleIds = new Set([...rankings.newScores, ...rankings.oldScores].map(score => score.songId));
  return {
    snapshot: {
      publicId: data.snapshot.publicId,
      game: data.snapshot.game,
      displayName: data.snapshot.displayName,
      rating: data.snapshot.rating,
      gameVersion: data.snapshot.gameVersion,
      fetchedAt: data.snapshot.fetchedAt,
      versionPlayCount: privacy.profileShowPlayCounts ? data.snapshot.versionPlayCount : null,
      totalPlayCount: privacy.profileShowPlayCounts ? data.snapshot.totalPlayCount : null,
    },
    songs: data.songs
      .filter(song => privacy.profileShowAllScores || visibleIds.has(song.songId))
      .map(song => ({
        songId: song.songId,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        difficultyCode: song.difficultyCode,
        typeCode: song.typeCode,
        level: song.level,
        levelPrecise: song.levelPrecise,
        genre: song.genre,
        addedVersion: song.addedVersion,
        scoreValue: song.scoreValue,
        secondaryScore: privacy.profileShowScoreDetails ? song.secondaryScore : null,
        comboStatus: privacy.profileShowScoreDetails ? song.comboStatus : 0,
        syncStatus: privacy.profileShowScoreDetails ? song.syncStatus : 0,
        clearStatus: privacy.profileShowScoreDetails ? song.clearStatus : 0,
      })),
  };
}
