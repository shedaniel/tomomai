import type { EventData } from "@/lib/types";
import type { CanonicalGameId } from "./types";
import { calculateChunithmChartRating, calculateMaimaiChartRating, selectChunithmRankings, selectMaimaiRankings } from "./rating";

export type GamePlayerScore = {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  genre: string;
  level: string;
  levelPrecise: number;
  addedVersion: number;
  difficultyCode: number;
  typeCode: number;
  scoreValue: number;
  secondaryScore: number | null;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
  chartRating?: number;
};

export type GameSnapshot = {
  publicId: string;
  game: CanonicalGameId;
  displayName: string;
  rating: number;
  gameVersion: number;
  fetchedAt: Date;
  title?: string;
  titleType?: number;
  iconUrl?: string;
  courseRankUrl?: string | null;
  classRankUrl?: string | null;
  stars?: number | null;
  versionPlayCount?: number | null;
  totalPlayCount?: number | null;
};

export type GameEvent = {
  name: string;
  eventType?: EventData["eventType"] | null;
  currentDistance?: number | null;
  nextRewardDistance?: number | null;
  state?: EventData["state"] | null;
  imageUrl?: string | null;
  eventPeriodStart?: Date | null;
  eventPeriodEnd?: Date | null;
};

export type GameSnapshotData = {
  snapshot: GameSnapshot;
  songs: GamePlayerScore[];
  events?: GameEvent[];
};

export type GameSnapshotSummary = {
  id: string;
  fetchedAt: Date;
  rating: number;
  displayName: string;
  gameVersion: number;
  courseRankUrl: string | null;
  classRankUrl: string | null;
  stars: number | null;
  versionPlayCount: number;
  totalPlayCount: number;
};

export function getPlayerRankings(game: CanonicalGameId, data: GameSnapshotData) {
  const rated = data.songs.map(score => ({
    ...score,
    chartId: score.songId,
    rating: score.chartRating ?? (game === "maimai"
      ? calculateMaimaiChartRating(score.scoreValue, score.levelPrecise, score.difficultyCode, score.comboStatus, data.snapshot.gameVersion)
      : calculateChunithmChartRating(score.scoreValue, score.levelPrecise)),
  }));
  return game === "maimai"
    ? selectMaimaiRankings(rated, data.snapshot.gameVersion)
    : selectChunithmRankings(rated, data.snapshot.gameVersion);
}

export function getSnapshotSelection(snapshots: readonly Pick<GameSnapshotSummary, "id">[], selected: string | null): string | null {
  return snapshots.some(snapshot => snapshot.id === selected) ? selected : snapshots[0]?.id ?? null;
}
