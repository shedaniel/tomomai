import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { fetchRecentSongs } from "@/server/queries/recents";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

export const GET = withApiKey(["recent:read"], async (req: NextRequest, key) => {
  const { searchParams } = req.nextUrl;
  const region = searchParams.get("region") as Region | null;
  const enabledRegions = getEnabledRegions();

  if (!region || !enabledRegions.includes(region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabledRegions.join(", ")}` },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

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

  return Response.json({ plays, totalCount, hasMore });
});
