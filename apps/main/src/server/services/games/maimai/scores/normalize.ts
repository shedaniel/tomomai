import "server-only";
import type { EventsData, PlayerData, RecentSongData, ScoreData } from "./types";
import type {
  NormalizedEvent,
  NormalizedPlayer,
  NormalizedRecent,
  NormalizedScore,
  ScoreFetchContext,
} from "@/server/services/games/types";
import { chartTypeToCode, difficultyToCode, titleTypeToCode } from "@/lib/games/maimai/codes";
import { fromMaimaiScore } from "../legacy-view";

type ChartContext = Pick<ScoreFetchContext, "region" | "gameVersion">;

export function normalizePlayer(player: PlayerData): NormalizedPlayer {
  return {
    displayName: player.displayName,
    rating: player.rating,
    title: player.title,
    titleType: titleTypeToCode(player.titleType),
    iconUrl: player.iconUrl,
    totalPlayCount: player.totalPlayCount,
    currentVersionPlayCount: player.versionPlayCount,
    courseRankUrl: player.courseRankUrl,
    classRankUrl: player.classRankUrl,
    stars: player.stars,
  };
}

export function normalizeScore(
  score: Pick<ScoreData, "songName" | "musicType" | "difficulty" | "achievement" | "dxScore" | "fc" | "fs">,
  ctx: ChartContext,
): NormalizedScore {
  return {
    chart: {
      game: "maimai",
      region: ctx.region,
      version: ctx.gameVersion,
      songName: score.songName,
      chartType: chartTypeToCode(score.musicType),
      difficulty: difficultyToCode(score.difficulty),
    },
    ...fromMaimaiScore(score),
    clearStatus: 0,
  };
}

export function normalizeRecent(recent: RecentSongData, ctx: ChartContext): NormalizedRecent {
  return {
    ...normalizeScore(recent, ctx),
    playedAt: recent.playedAt,
    track: recent.track,
    maxSecondaryScore: recent.maxDxScore,
  };
}

export function normalizeEvents(events: EventsData): NormalizedEvent[] {
  const areaEvents = events.areaEvents.map(event => ({
    name: event.name,
    eventType: "area",
    currentDistance: event.currentDistance,
    nextRewardDistance: event.nextRewardDistance,
    state: event.state,
    imageUrl: event.imageUrl,
  } satisfies NormalizedEvent));
  const eventAreaEvents = events.eventAreaEvents.map(event => ({
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
