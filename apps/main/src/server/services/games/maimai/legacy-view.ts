import type { GamePlayerScore, GameSnapshot } from "@/lib/games/player-view";
import type { Difficulty, FullCombo, FullSync, SongType, TitleType } from "@/lib/games/maimai/types";
import {
  codeToChartType,
  codeToComboStatus,
  codeToDifficulty,
  codeToSyncStatus,
  codeToTitleType,
  comboStatusToCode,
  syncStatusToCode,
} from "@/lib/games/maimai/codes";

type ScoreResult = Pick<GamePlayerScore, "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus">;
type MaimaiResult = { achievement: number; dxScore: number; fc: FullCombo; fs: FullSync };

type MaimaiSnapshotHeader = Pick<GameSnapshot, "fetchedAt" | "rating" | "displayName" | "gameVersion"> & {
  id: string;
  title: string;
  titleType: TitleType;
  iconUrl: string;
  courseRankUrl: string;
  classRankUrl: string;
  stars: number;
  versionPlayCount: number;
  totalPlayCount: number;
};

export function toMaimaiChart(chart: Pick<GamePlayerScore, "difficultyCode" | "typeCode">): { difficulty: Difficulty; type: SongType } {
  return {
    difficulty: codeToDifficulty(chart.difficultyCode),
    type: codeToChartType(chart.typeCode),
  };
}

export function toMaimaiResult(score: ScoreResult): MaimaiResult {
  return {
    achievement: score.scoreValue,
    dxScore: score.secondaryScore ?? 0,
    fc: codeToComboStatus(score.comboStatus),
    fs: codeToSyncStatus(score.syncStatus),
  };
}

export function fromMaimaiScore(score: MaimaiResult): Record<keyof ScoreResult, number> {
  return {
    scoreValue: score.achievement,
    secondaryScore: score.dxScore,
    comboStatus: comboStatusToCode(score.fc),
    syncStatus: syncStatusToCode(score.fs),
  };
}

export function toMaimaiSnapshotHeader(snapshot: GameSnapshot): MaimaiSnapshotHeader {
  return {
    id: snapshot.publicId,
    fetchedAt: snapshot.fetchedAt,
    rating: snapshot.rating,
    displayName: snapshot.displayName,
    gameVersion: snapshot.gameVersion,
    title: snapshot.title ?? "",
    titleType: codeToTitleType(snapshot.titleType ?? 0),
    iconUrl: snapshot.iconUrl ?? "",
    courseRankUrl: snapshot.courseRankUrl ?? "",
    classRankUrl: snapshot.classRankUrl ?? "",
    stars: snapshot.stars ?? 0,
    versionPlayCount: snapshot.versionPlayCount ?? 0,
    totalPlayCount: snapshot.totalPlayCount ?? 0,
  };
}
