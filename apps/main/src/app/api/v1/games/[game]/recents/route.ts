import { defineGameHandler, keyHasScope } from "@/lib/api/protect";
import { fetchRecentSongs } from "@/server/queries/recents";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { region, limit = 50, offset = 0 } = query;
  const hasDetailed = keyHasScope(key, "recent:detailed:read");

  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs(game, key.userId, region, limit, offset);

  const plays = recentPlays.map((p) => {
    const base = {
      playedAt: p.playedAt.toISOString(),
      scoreValue: p.scoreValue,
      secondaryScore: p.secondaryScore,
      maxDxScore: p.maxDxScore,
      comboStatus: p.comboStatus,
      syncStatus: p.syncStatus,
      clearStatus: p.clearStatus,
      track: p.track,
      song: {
        songId: p.songId,
        songName: p.songName,
        artist: p.artist,
        cover: p.cover,
        difficulty: p.difficultyCode,
        level: p.level,
        levelPrecise: p.levelPrecise,
        type: p.typeCode,
        genre: p.genre,
      },
    };

    if (!hasDetailed) return base;

    return {
      ...base,
      venue: p.venue ?? null,
      combo: p.combo ?? null,
      maxCombo: p.maxCombo ?? null,
      syncScore: p.syncScore ?? null,
      maxSyncScore: p.maxSyncScore ?? null,
      rating: p.rating ?? null,
      ratingChange: p.ratingChange ?? null,
      notes: p.tapCPerfect != null
        ? {
            tap: { cPerfect: p.tapCPerfect, perfect: p.tapPerfect, great: p.tapGreat, good: p.tapGood, miss: p.tapMiss },
            hold: { cPerfect: p.holdCPerfect, perfect: p.holdPerfect, great: p.holdGreat, good: p.holdGood, miss: p.holdMiss },
            slide: { cPerfect: p.slideCPerfect, perfect: p.slidePerfect, great: p.slideGreat, good: p.slideGood, miss: p.slideMiss },
            touch: { cPerfect: p.touchCPerfect, perfect: p.touchPerfect, great: p.touchGreat, good: p.touchGood, miss: p.touchMiss },
            break: { cPerfect: p.breakCPerfect, perfect: p.breakPerfect, great: p.breakGreat, good: p.breakGood, miss: p.breakMiss },
            fast: p.fastCount ?? null,
            late: p.lateCount ?? null,
          }
        : null,
    };
  });

  return { plays, totalCount, hasMore };
});
