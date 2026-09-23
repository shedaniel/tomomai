import { getPlayerRankings, type GameSnapshotData } from "./player-view";
import type { CanonicalGameId } from "./types";

export interface PlayerPrivacy {
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents?: boolean;
}

export function toPublicGameSnapshot(game: CanonicalGameId, data: GameSnapshotData, privacy: PlayerPrivacy): GameSnapshotData {
  if (data.snapshot.game !== game) throw new Error("Snapshot game does not match the public profile");
  const rankings = getPlayerRankings(game, data);
  const chartRatings = new Map([...rankings.newScores, ...rankings.oldScores, ...rankings.newRemaining, ...rankings.oldRemaining].map(score => [score.songId, score.rating]));
  const visibleIds = new Set([...rankings.newScores, ...rankings.oldScores].map(score => score.songId));
  return {
    snapshot: {
      publicId: data.snapshot.publicId,
      game: data.snapshot.game,
      displayName: data.snapshot.displayName,
      rating: data.snapshot.rating,
      gameVersion: data.snapshot.gameVersion,
      fetchedAt: data.snapshot.fetchedAt,
      title: data.snapshot.title,
      titleType: data.snapshot.titleType,
      iconUrl: data.snapshot.iconUrl,
      courseRankUrl: data.snapshot.courseRankUrl,
      classRankUrl: data.snapshot.classRankUrl,
      stars: data.snapshot.stars,
      versionPlayCount: privacy.profileShowPlayCounts ? data.snapshot.versionPlayCount : null,
      totalPlayCount: privacy.profileShowPlayCounts ? data.snapshot.totalPlayCount : null,
    },
    ...(privacy.profileShowEvents && data.events ? { events: data.events.map(event => ({
      name: event.name, eventType: event.eventType, currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance, state: event.state, imageUrl: event.imageUrl,
      eventPeriodStart: event.eventPeriodStart, eventPeriodEnd: event.eventPeriodEnd,
    })) } : {}),
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
        chartRating: chartRatings.get(song.songId),
        secondaryScore: privacy.profileShowScoreDetails ? song.secondaryScore : null,
        comboStatus: privacy.profileShowScoreDetails ? song.comboStatus : 0,
        syncStatus: privacy.profileShowScoreDetails ? song.syncStatus : 0,
        clearStatus: privacy.profileShowScoreDetails ? song.clearStatus : 0,
      })),
  };
}
