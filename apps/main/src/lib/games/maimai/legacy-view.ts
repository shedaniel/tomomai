import type { EventData } from "@/lib/types";
import type { SnapshotWithSongs, SongWithScore } from "./types";
import type { GameEvent, GamePlayerScore, GameSnapshot, GameSnapshotData } from "@/lib/games/player-view";
import {
  codeToChartType,
  codeToComboStatus,
  codeToDifficulty,
  codeToSyncStatus,
  codeToTitleType,
  comboStatusToCode,
  syncStatusToCode,
} from "./codes";
import { requireMaimaiVersion } from "./versions";

type ScoreResult = Pick<GamePlayerScore, "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus">;
type MaimaiResult = Pick<SongWithScore, "achievement" | "dxScore" | "fc" | "fs">;

export function toMaimaiChart(chart: Pick<GamePlayerScore, "difficultyCode" | "typeCode">): Pick<SongWithScore, "difficulty" | "type"> {
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

export function toMaimaiScore(score: GamePlayerScore) {
  return {
    ...score,
    addedVersion: requireMaimaiVersion(score.addedVersion),
    ...toMaimaiChart(score),
    ...toMaimaiResult(score),
  };
}

export function toMaimaiSnapshot(data: GameSnapshotData): SnapshotWithSongs {
  return {
    snapshot: toMaimaiSnapshotHeader(data.snapshot),
    songs: data.songs.map(toMaimaiScore),
    events: data.events?.map(toMaimaiEvent),
  };
}

export function toMaimaiSnapshotHeader(snapshot: GameSnapshot): SnapshotWithSongs["snapshot"] {
  return {
    ...snapshot,
    ...toMaimaiRanks(snapshot),
    id: snapshot.publicId,
    title: snapshot.title ?? "",
    titleType: codeToTitleType(snapshot.titleType ?? 0),
    iconUrl: snapshot.iconUrl ?? "",
    versionPlayCount: snapshot.versionPlayCount ?? 0,
    totalPlayCount: snapshot.totalPlayCount ?? 0,
  };
}

function toMaimaiEvent(event: GameEvent): EventData {
  return {
    ...event,
    eventType: event.eventType ?? "eventArea",
    currentDistance: event.currentDistance ?? 0,
    nextRewardDistance: event.nextRewardDistance ?? null,
    state: event.state ?? "not_started",
    imageUrl: event.imageUrl ?? "",
    eventPeriodStart: event.eventPeriodStart ?? null,
    eventPeriodEnd: event.eventPeriodEnd ?? null,
  };
}

function toMaimaiRanks(snapshot: Pick<GameSnapshot, "courseRankUrl" | "classRankUrl" | "stars">) {
  return {
    courseRankUrl: snapshot.courseRankUrl ?? "",
    classRankUrl: snapshot.classRankUrl ?? "",
    stars: snapshot.stars ?? 0,
  };
}
