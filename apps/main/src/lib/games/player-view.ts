import type { fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import type { Snapshot, SnapshotWithSongs, EventData } from "@/lib/types";
import { requireMaimaiVersion } from "./adapters/maimai/versions";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, codeToTitleType } from "@/lib/maimai/codes";
import type { CanonicalGameId } from "./types";
import { calculateChunithmChartRating, calculateMaimaiChartRating, selectChunithmRankings, selectMaimaiRankings } from "./rating";

type StoredSnapshotData = NonNullable<Awaited<ReturnType<typeof fetchSnapshotData>>>;
export type GamePlayerScore = Omit<StoredSnapshotData["songs"][number], "secondaryScore"> & { secondaryScore: number | null; chartRating?: number };
export interface GameSnapshotData {
  snapshot: Pick<StoredSnapshotData["snapshot"], "publicId" | "game" | "displayName" | "rating" | "gameVersion" | "fetchedAt"> & {
    title?: string;
    titleType?: number;
    iconUrl?: string;
    courseRankUrl?: string | null;
    classRankUrl?: string | null;
    stars?: number | null;
    versionPlayCount?: number | null;
    totalPlayCount?: number | null;
  };
  songs: GamePlayerScore[];
  events?: ({ name: string } & Partial<{ [K in keyof EventData]: EventData[K] | null }>)[];
}
export type GameSnapshotSummary = Awaited<ReturnType<typeof fetchUserSnapshots>>[number];

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

export function toPlayerSnapshotSummary(snapshot: GameSnapshotSummary): Snapshot {
  return { ...snapshot, gameVersion: snapshot.gameVersion, courseRankUrl: snapshot.courseRankUrl ?? "", classRankUrl: snapshot.classRankUrl ?? "", stars: snapshot.stars ?? 0 };
}

export function toMaimaiPlayerSnapshot(data: GameSnapshotData): SnapshotWithSongs {
  return {
    snapshot: {
      ...data.snapshot, id: data.snapshot.publicId, gameVersion: requireMaimaiVersion(data.snapshot.gameVersion),
      title: data.snapshot.title ?? "", titleType: codeToTitleType(data.snapshot.titleType ?? 0), iconUrl: data.snapshot.iconUrl ?? "",
      courseRankUrl: data.snapshot.courseRankUrl ?? "", classRankUrl: data.snapshot.classRankUrl ?? "", stars: data.snapshot.stars ?? 0,
      versionPlayCount: data.snapshot.versionPlayCount ?? 0, totalPlayCount: data.snapshot.totalPlayCount ?? 0,
    },
    songs: data.songs.map(toMaimaiPlayerScore),
    events: data.events?.map(event => ({ ...event, eventType: event.eventType ?? "eventArea", currentDistance: event.currentDistance ?? 0, nextRewardDistance: event.nextRewardDistance ?? null, state: event.state ?? "not_started", imageUrl: event.imageUrl ?? "", eventPeriodStart: event.eventPeriodStart ?? null, eventPeriodEnd: event.eventPeriodEnd ?? null })),
  };
}

export function toMaimaiPlayerScore(song: GamePlayerScore) {
  return { ...song, addedVersion: requireMaimaiVersion(song.addedVersion), achievement: song.scoreValue, dxScore: song.secondaryScore ?? 0, difficulty: codeToDifficulty(song.difficultyCode), type: codeToChartType(song.typeCode), fc: codeToComboStatus(song.comboStatus), fs: codeToSyncStatus(song.syncStatus) };
}
