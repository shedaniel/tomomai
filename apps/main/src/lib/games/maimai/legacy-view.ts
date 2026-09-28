import type { EventData, Snapshot, SnapshotWithSongs } from "@/lib/types";
import type { GamePlayerScore, GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, codeToTitleType } from "./codes";
import { requireMaimaiVersion } from "./versions";

export function toPlayerSnapshotSummary(snapshot: GameSnapshotSummary): Snapshot {
  return {
    ...snapshot,
    courseRankUrl: snapshot.courseRankUrl ?? "",
    classRankUrl: snapshot.classRankUrl ?? "",
    stars: snapshot.stars ?? 0,
  };
}

export function toMaimaiPlayerSnapshot(data: GameSnapshotData): SnapshotWithSongs {
  return {
    snapshot: toMaimaiSnapshotHeader(data.snapshot),
    songs: data.songs.map(toMaimaiPlayerScore),
    events: data.events?.map(toMaimaiEvent),
  };
}

export function toMaimaiPlayerScore(song: GamePlayerScore) {
  return {
    ...song,
    addedVersion: requireMaimaiVersion(song.addedVersion),
    achievement: song.scoreValue,
    dxScore: song.secondaryScore ?? 0,
    difficulty: codeToDifficulty(song.difficultyCode),
    type: codeToChartType(song.typeCode),
    fc: codeToComboStatus(song.comboStatus),
    fs: codeToSyncStatus(song.syncStatus),
  };
}

function toMaimaiSnapshotHeader(snapshot: GameSnapshotData["snapshot"]): SnapshotWithSongs["snapshot"] {
  return {
    ...snapshot,
    id: snapshot.publicId,
    gameVersion: requireMaimaiVersion(snapshot.gameVersion),
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

function toMaimaiEvent(event: NonNullable<GameSnapshotData["events"]>[number]): EventData {
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
