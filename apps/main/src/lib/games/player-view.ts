import type { fetchSnapshotDataForGame, fetchUserSnapshotsForGame } from "@/server/queries/snapshots";
import type { CanonicalGameId } from "./types";
import { calculateChunithmChartRating, calculateMaimaiChartRating, selectChunithmRankings, selectMaimaiRankings } from "./rating";

type StoredSnapshotData = NonNullable<Awaited<ReturnType<typeof fetchSnapshotDataForGame>>>;
export type GamePlayerScore = Omit<StoredSnapshotData["songs"][number], "secondaryScore" | "achievement" | "dxScore" | "fc" | "fs" | "difficulty" | "type"> & { secondaryScore: number | null };
export interface GameSnapshotData {
  snapshot: Pick<StoredSnapshotData["snapshot"], "publicId" | "game" | "displayName" | "rating" | "gameVersion" | "fetchedAt"> & {
    versionPlayCount?: number | null;
    totalPlayCount?: number | null;
  };
  songs: GamePlayerScore[];
}
export type GameSnapshotSummary = Awaited<ReturnType<typeof fetchUserSnapshotsForGame>>[number];

export function getPlayerRankings(game: CanonicalGameId, data: GameSnapshotData) {
  const rated = data.songs.map(score => ({
    ...score,
    chartId: score.songId,
    rating: game === "maimai"
      ? calculateMaimaiChartRating(score.scoreValue, score.levelPrecise, score.difficultyCode, score.comboStatus, data.snapshot.gameVersion)
      : calculateChunithmChartRating(score.scoreValue, score.levelPrecise),
  }));
  return game === "maimai"
    ? selectMaimaiRankings(rated, data.snapshot.gameVersion)
    : selectChunithmRankings(rated, data.snapshot.gameVersion);
}

export function getSnapshotSelection(snapshots: readonly Pick<GameSnapshotSummary, "id">[], selected: string | null): string | null {
  return snapshots.some(snapshot => snapshot.id === selected) ? selected : snapshots[0]?.id ?? null;
}
