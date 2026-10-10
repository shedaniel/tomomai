import { getPlayerRankings, type GameSnapshot, type GameSnapshotData } from "./player-view";
import type { CanonicalGameId } from "./ids";
import type { ProfilePrivacySettings } from "@/lib/types";
import type { StatsResult } from "@/server/queries/stats";

type SnapshotPrivacy = Pick<ProfilePrivacySettings, "profileShowAllScores" | "profileShowScoreDetails" | "profileShowPlayCounts">
  & Partial<Pick<ProfilePrivacySettings, "profileShowEvents">>;

type ViewPrivacy = Pick<ProfilePrivacySettings, "profileShowAllScores" | "profileShowScoreDetails" | "profileShowPlates">;

/**
 * The views of a published snapshot a visitor may open, each with the privacy settings it needs.
 * The player tabs hide a view and the public procedures refuse it by the same rule.
 */
export const PUBLIC_VIEWS = {
  /** Grade and status counts over every score. */
  stats: privacy => privacy.profileShowAllScores,
  /** Recent plays, last credit and daily plays. */
  recentPlays: privacy => privacy.profileShowScoreDetails,
  /** Plate progress and the charts each plate still needs, which read every score's statuses. */
  plates: privacy => privacy.profileShowAllScores && privacy.profileShowScoreDetails && privacy.profileShowPlates,
} as const satisfies Record<string, (privacy: ViewPrivacy) => boolean>;

export type PublicView = keyof typeof PUBLIC_VIEWS;

export function toPublicSnapshotHeader(snapshot: GameSnapshot, privacy: Pick<ProfilePrivacySettings, "profileShowPlayCounts">): GameSnapshot {
  return {
    publicId: snapshot.publicId,
    game: snapshot.game,
    displayName: snapshot.displayName,
    rating: snapshot.rating,
    gameVersion: snapshot.gameVersion,
    fetchedAt: snapshot.fetchedAt,
    title: snapshot.title,
    titleType: snapshot.titleType,
    iconUrl: snapshot.iconUrl,
    courseRankUrl: snapshot.courseRankUrl,
    classRankUrl: snapshot.classRankUrl,
    stars: snapshot.stars,
    versionPlayCount: privacy.profileShowPlayCounts ? snapshot.versionPlayCount : null,
    totalPlayCount: privacy.profileShowPlayCounts ? snapshot.totalPlayCount : null,
  };
}

/** Status counts are score details, so a visitor without them sees grades only. */
export function toPublicStats(stats: StatsResult, privacy: Pick<ProfilePrivacySettings, "profileShowScoreDetails">): StatsResult {
  if (privacy.profileShowScoreDetails) return stats;
  return {
    totalSongs: stats.totalSongs,
    stats: Object.fromEntries(Object.entries(stats.stats).map(([version, difficulties]) => [
      version,
      Object.fromEntries(Object.entries(difficulties).map(([difficulty, bucket]) => [difficulty, { ...bucket, statuses: {} }])),
    ])),
  };
}

export function toPublicGameSnapshot(game: CanonicalGameId, data: GameSnapshotData, privacy: SnapshotPrivacy): GameSnapshotData {
  if (data.snapshot.game !== game) throw new Error("Snapshot game does not match the public profile");
  const { rated, newScores, oldScores } = getPlayerRankings(game, data);
  const chartRatings = new Map(rated.map(score => [score.songId, score.rating]));
  const visibleIds = new Set([...newScores, ...oldScores].map(score => score.songId));
  return {
    snapshot: toPublicSnapshotHeader(data.snapshot, privacy),
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
