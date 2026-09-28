import type { ScoreData } from "@/lib/maimai/types";
import type {
  ConfiguredScoreAdapter,
  GameFetchResult,
  NormalizedEvent,
  NormalizedRecent,
  NormalizedScore,
  PersistedSnapshotContext,
  ScoreFetchContext,
} from "@/server/services/games/types";
import {
  chartTypeToCode,
  comboStatusToCode,
  difficultyToCode,
  syncStatusToCode,
  titleTypeToCode,
} from "@/lib/games/maimai/codes";
import { uploadPlayerIcon } from "@/lib/maimai/player/persist";
import type { Region } from "@/lib/types";
import type { FetchedMaimaiData } from "@/lib/maimai/orchestrator";

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

export const maimaiScoreAdapter: ConfiguredScoreAdapter = {
  configured: true,
  validateToken(ctx) {
    if (ctx.token.startsWith("cn-cookies://") && !ctx.tokenProvided) {
      throw new Error("CN_COOKIES_SINGLE_USE: This session token is single-use and has already been consumed. Please re-authenticate via the HTTP Proxy flow.");
    }
  },
  async fetch(ctx: ScoreFetchContext) {
    const { runMaimaiFetcher, persistMaimaiExtra } = await import("@/lib/maimai/orchestrator");
    const { fetched } = await runMaimaiFetcher(ctx);
    const result = await normalizeFetchedMaimaiData(fetched, {
      region: ctx.region,
      version: ctx.gameVersion,
    });

    return {
      result,
      persistExtra: async (persistCtx: PersistedSnapshotContext, backgroundWorkRef?: { promise: Promise<void> }) => {
        return persistMaimaiExtra(
          persistCtx,
          fetched,
          ctx.shouldFetchAlbums,
          backgroundWorkRef,
        );
      },
    };
  },
};
