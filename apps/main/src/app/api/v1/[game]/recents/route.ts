import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { fetchRecentSongs } from "@/server/queries/recents";
import { spec } from "./spec";

export const GET = withApiKey(["recent:read"], async (req: NextRequest, key, ctx) => {
  const params = await parseParams(ctx.params, spec.params!);
  if (params instanceof Response) return params;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, limit = 50, offset = 0 } = parsed;
  const hasDetailed = keyHasScope(key, "recent:detailed:read");

  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs(
    key.userId,
    region,
    limit,
    offset
  );

  const plays = recentPlays.map((p) => {
    const base = {
      playedAt: p.playedAt.toISOString(),
      achievement: p.achievement,
      dxScore: p.dxScore,
      maxDxScore: p.maxDxScore,
      fc: p.fc,
      fs: p.fs,
      track: p.track,
      song: {
        songId: p.songId,
        songName: p.songName,
        artist: p.artist,
        cover: p.cover,
        difficulty: p.difficulty,
        level: p.level,
        levelPrecise: p.levelPrecise,
        type: p.type,
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

  return zodJson(spec.response, { plays, totalCount, hasMore });
});
