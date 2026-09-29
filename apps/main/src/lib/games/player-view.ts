import type { EventData } from "@/lib/types";
import type { CanonicalGameId } from "./types";
import { rankScores } from "./ranking";

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
  publicId: string;
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

/** The snapshot's ranking selection, plus `rated`: every score with its precise rating. */
export function getPlayerRankings(game: CanonicalGameId, data: GameSnapshotData) {
  return rankScores(game, data.songs, data.snapshot.gameVersion);
}

export function getSnapshotSelection(snapshots: readonly Pick<GameSnapshotSummary, "publicId">[], selected: string | null): string | null {
  return snapshots.some(snapshot => snapshot.publicId === selected) ? selected : snapshots[0]?.publicId ?? null;
}
