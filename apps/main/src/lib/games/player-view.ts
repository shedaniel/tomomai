import type { fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import type { EventData } from "@/lib/types";
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
