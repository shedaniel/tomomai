import "server-only";
import type { FetchedMaimaiData, ScoreData } from "./types";
import type {
  GameFetchResult,
  NormalizedEvent,
  NormalizedRecent,
  NormalizedScore,
} from "@/server/services/games/types";
import {
  chartTypeToCode,
  comboStatusToCode,
  difficultyToCode,
  syncStatusToCode,
  titleTypeToCode,
} from "@/lib/games/maimai/codes";
import { uploadPlayerIcon } from "./player/persist";
import type { Region } from "@/lib/types";

type MaimaiNormalizeContext = {
  region: Region;
  version: number;
};

function normalizeScore(
  score: Pick<ScoreData, "songName" | "musicType" | "difficulty" | "achievement" | "dxScore" | "fc" | "fs">,
  ctx: MaimaiNormalizeContext,
): NormalizedScore {
  return {
    chart: {
      game: "maimai",
      region: ctx.region,
      version: ctx.version,
      songName: score.songName,
      chartType: chartTypeToCode(score.musicType),
      difficulty: difficultyToCode(score.difficulty),
    },
    scoreValue: score.achievement,
    secondaryScore: score.dxScore,
    comboStatus: comboStatusToCode(score.fc),
    syncStatus: syncStatusToCode(score.fs),
    clearStatus: 0,
  };
}

function normalizeRecent(
  recent: FetchedMaimaiData["recentSongsData"][number],
  ctx: MaimaiNormalizeContext,
): NormalizedRecent {
  return {
    ...normalizeScore(recent, ctx),
    playedAt: recent.playedAt,
    maxDxScore: recent.maxDxScore,
    track: recent.track,
  };
}

function normalizeEvents(fetched: FetchedMaimaiData): NormalizedEvent[] {
  if (!fetched.eventsData) return [];

  const areaEvents = fetched.eventsData.areaEvents.map(event => ({
    name: event.name,
    eventType: "area",
    currentDistance: event.currentDistance,
    nextRewardDistance: event.nextRewardDistance,
    state: event.state,
    imageUrl: event.imageUrl,
  } satisfies NormalizedEvent));
  const eventAreaEvents = fetched.eventsData.eventAreaEvents.map(event => ({
    name: event.name,
    eventType: "eventArea",
    currentDistance: event.currentDistance,
    nextRewardDistance: event.nextRewardDistance,
    state: event.state,
    imageUrl: event.imageUrl,
    eventPeriodStart: event.eventPeriod ? new Date(event.eventPeriod[0]) : null,
    eventPeriodEnd: event.eventPeriod ? new Date(event.eventPeriod[1]) : null,
  } satisfies NormalizedEvent));
  return [...areaEvents, ...eventAreaEvents];
}

export async function normalizeFetchedMaimaiData(
  fetched: FetchedMaimaiData,
  ctx: MaimaiNormalizeContext,
): Promise<GameFetchResult> {
  const player = fetched.playerData;
  const playerIconUrl = await uploadPlayerIcon(player);
  const scores = Object.values(fetched.allSongsData).flat().map(score => normalizeScore(score, ctx));

  return {
    player: {
      displayName: player.displayName,
      rating: player.rating,
      title: player.title,
      titleType: titleTypeToCode(player.titleType),
      iconUrl: playerIconUrl,
      totalPlayCount: player.totalPlayCount,
      currentVersionPlayCount: player.versionPlayCount,
      courseRankUrl: player.courseRankUrl,
      classRankUrl: player.classRankUrl,
      stars: player.stars,
    },
    scores,
    recents: fetched.recentSongsData.map(recent => normalizeRecent(recent, ctx)),
    events: normalizeEvents(fetched),
  };
}
