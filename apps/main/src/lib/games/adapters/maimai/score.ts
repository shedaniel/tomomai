import type {
  GameFetchResult,
  NormalizedAlbum,
  NormalizedEvent,
  NormalizedRecent,
  NormalizedScore,
  PersistedSnapshotContext,
  ScoreAdapter,
  ScoreFetchContext,
} from "@/lib/games/types";
import {
  chartTypeToCode,
  comboStatusToCode,
  difficultyToCode,
  syncStatusToCode,
  titleTypeToCode,
} from "@/lib/maimai/codes";
import { uploadPlayerIcon } from "@/lib/maimai/player/persist";
import type { Difficulty, Region } from "@/lib/types";
import type { FetchedMaimaiData } from "@/lib/maimai/orchestrator";

type MaimaiNormalizeContext = {
  region: Region;
  version: number;
};

function normalizeScore(
  score: {
    songName: string;
    musicType: "std" | "dx";
    difficulty: Difficulty;
    achievement: number;
    dxScore: number;
    fc: "none" | "fc" | "fc+" | "ap" | "ap+";
    fs: "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+";
  },
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
    ...normalizeScore({
      songName: recent.songName,
      musicType: recent.musicType,
      difficulty: recent.difficulty as Difficulty,
      achievement: recent.achievement,
      dxScore: recent.dxScore,
      fc: recent.fc,
      fs: recent.fs,
    }, ctx),
    playedAt: recent.playedAt,
    details: {
      level: recent.level,
      maxDxScore: recent.maxDxScore,
      track: recent.track,
      idx: recent.idx,
    },
  };
}

function normalizeAlbum(
  album: FetchedMaimaiData["albumData"][number],
  ctx: MaimaiNormalizeContext,
): NormalizedAlbum {
  return {
    chart: {
      game: "maimai",
      region: ctx.region,
      version: ctx.version,
      songName: album.songName,
      chartType: chartTypeToCode(album.musicType),
      difficulty: difficultyToCode(album.difficulty),
    },
    capturedAt: album.takenAt,
    metadata: {
      imageUrl: album.imageUrl,
      venue: album.venue,
    },
  };
}

function normalizeEvents(fetched: FetchedMaimaiData): NormalizedEvent[] {
  if (!fetched.eventsData) return [];

  const areaEvents = fetched.eventsData.areaEvents.map(event => ({
    name: event.name,
    metadata: {
      eventType: "area",
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
    },
  } satisfies NormalizedEvent));
  const eventAreaEvents = fetched.eventsData.eventAreaEvents.map(event => ({
    name: event.name,
    metadata: {
      eventType: "eventArea",
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
      eventPeriod: event.eventPeriod,
    },
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
    albums: fetched.albumData.map(album => normalizeAlbum(album, ctx)),
    events: normalizeEvents(fetched),
    providerMetadata: { cookies: fetched.cookies },
  };
}

export const maimaiScoreAdapter: ScoreAdapter = {
  configured: true,
  validateToken(ctx) {
    if (ctx.token.startsWith("cn-cookies://") && !ctx.tokenProvided) {
      throw new Error("CN_COOKIES_SINGLE_USE: This session token is single-use and has already been consumed. Please re-authenticate via the HTTP Proxy flow.");
    }
  },
  async fetch(ctx: ScoreFetchContext) {
    const { runMaimaiFetcher } = await import("@/lib/maimai/orchestrator");
    const { fetched } = await runMaimaiFetcher(ctx);
    const result = await normalizeFetchedMaimaiData(fetched, {
      region: ctx.region,
      version: ctx.gameVersion,
    });

    return {
      result,
      persistExtra: async (persistCtx: PersistedSnapshotContext, backgroundWorkRef?: { promise: Promise<void> }) => {
        const { persistMaimaiExtra } = await import("@/lib/maimai/orchestrator");
        return persistMaimaiExtra(
          persistCtx,
          fetched,
          ctx.extra?.shouldFetchAlbums === true,
          backgroundWorkRef,
        );
      },
    };
  },
};
