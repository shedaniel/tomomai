/**
 * Builds `RenderMessage` DTOs from DB data, then mints signed tokens.
 *
 * This is the mint side of the render-token contract (see
 * @tomomai/render-token + docs/render-token-v1.md). apps/main does ALL the DB
 * work here; apps/render receives the signed token and joins catalog fields
 * from /api/v1/songs — zero DB access on the render side.
 *
 * The token carries user scores + header metadata (HMAC-signed, tamper-proof);
 * catalog fields (songName, cover, level, etc.) never travel in the token.
 */

import { db } from "@/lib/db";
import {
  scoreData,
  snapshotB50,
  songs,
  user,
  userSnapshots,
} from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import type { VersionId } from "@/lib/metadata";
import {
  getReservedSnapshotData,
  RESERVED_USERNAMES,
} from "@/server/queries/reserved";
import { prepareCreditData } from "@/server/services/credit-data";
import { prepareDailyPlaysData } from "@/server/services/daily-plays-data";
import type {
  ChartRecord,
  FullCombo,
  FullSync,
  RenderHeader,
  RenderMessage,
  TrackRecord,
} from "@tomomai/render-token";

const DEFAULT_TTL = 300;

function expFromTtl(ttl: number): number {
  return Math.floor(Date.now() / 1000) + ttl;
}

// ---- Export image ----

export type ExportImageResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; status: number; error: string };

export async function buildExportImageMessage(opts: {
  snapshotId: string;
  username?: string;
  region?: Region;
  scale: 1 | 2;
  ttlSeconds?: number;
}): Promise<ExportImageResult> {
  const { snapshotId, username, region, scale } = opts;
  const exp = expFromTtl(opts.ttlSeconds ?? DEFAULT_TTL);

  // ---- reserved-profile path ----
  if (username && region && RESERVED_USERNAMES.has(username.toLowerCase())) {
    const reserved = await getReservedSnapshotData(username.toLowerCase(), region);
    if (!reserved) {
      return { ok: false, status: 404, error: "Reserved profile not found" };
    }
    const header: RenderHeader = {
      scale,
      exp,
      gameVersion: reserved.snapshot.gameVersion as number,
      region,
      rating: reserved.snapshot.rating,
      displayName: reserved.snapshot.displayName,
      iconUrl: reserved.snapshot.iconUrl,
      title: reserved.snapshot.title,
      titleType: reserved.snapshot.titleType,
      classRankUrl: reserved.snapshot.classRankUrl,
      courseRankUrl: reserved.snapshot.courseRankUrl,
    };
    const charts: ChartRecord[] = reserved.songs.map((s) => ({
      songId: s.songId,
      achievement: s.achievement,
      fc: s.fc as FullCombo,
      fs: s.fs as FullSync,
    }));
    return {
      ok: true,
      message: {
        route: "export-image",
        header,
        payload: { visitableProfileAt: username, charts },
      },
    };
  }

  // ---- normal DB path ----
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(eq(userSnapshots.publicId, snapshotId))
    .limit(1);

  if (snapshot.length === 0) {
    return { ok: false, status: 404, error: "Snapshot not found" };
  }

  const [userRow, scoreRows] = await Promise.all([
    db
      .select({ username: user.username, publishProfile: user.publishProfile })
      .from(user)
      .where(eq(user.id, snapshot[0].userId))
      .limit(1),
    db
      .select({
        songId: songs.publicId,
        achievement: scoreData.achievement,
        fc: scoreData.fc,
        fs: scoreData.fs,
      })
      .from(snapshotB50)
      .innerJoin(scoreData, eq(snapshotB50.scoreId, scoreData.id))
      .innerJoin(songs, eq(scoreData.songId, songs.id))
      .where(eq(snapshotB50.snapshotId, snapshot[0].id)),
  ]);

  if (userRow.length === 0) {
    return { ok: false, status: 404, error: "User not found" };
  }

  const visitableProfileAt =
    userRow[0].publishProfile && userRow[0].username ? userRow[0].username : null;

  const header: RenderHeader = {
    scale,
    exp,
    gameVersion: snapshot[0].gameVersion as VersionId,
    region: snapshot[0].region,
    rating: snapshot[0].rating,
    displayName: snapshot[0].displayName,
    iconUrl: snapshot[0].iconUrl,
    title: snapshot[0].title,
    titleType: snapshot[0].titleType,
    classRankUrl: snapshot[0].classRankUrl,
    courseRankUrl: snapshot[0].courseRankUrl,
  };

  const charts: ChartRecord[] = scoreRows.map((r) => ({
    songId: r.songId,
    achievement: r.achievement,
    fc: r.fc as FullCombo,
    fs: r.fs as FullSync,
  }));

  return {
    ok: true,
    message: {
      route: "export-image",
      header,
      payload: { visitableProfileAt, charts },
    },
  };
}

// ---- Last credit ----

export type LastCreditResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; status: number; error: string };

export async function buildLastCreditMessage(opts: {
  userId: string;
  region: Region;
  beforeDate?: Date;
  scale: 1 | 2;
  ttlSeconds?: number;
}): Promise<LastCreditResult> {
  const { userId, region, beforeDate, scale } = opts;
  const exp = expFromTtl(opts.ttlSeconds ?? DEFAULT_TTL);

  const result = await prepareCreditData(userId, region, beforeDate);
  if (result.type === "error") {
    return { ok: false, status: 404, error: result.error };
  }

  const header: RenderHeader = {
    scale,
    exp,
    gameVersion: result.snapshot.gameVersion as number,
    region,
    rating: result.snapshot.rating,
    displayName: result.snapshot.displayName,
    iconUrl: result.snapshot.iconUrl,
    title: result.snapshot.title,
    titleType: result.snapshot.titleType,
    classRankUrl: result.snapshot.classRankUrl,
    courseRankUrl: result.snapshot.courseRankUrl,
  };

  const tracks: TrackRecord[] = result.credit.tracks.map((t) => ({
    songId: t.songPublicId,
    achievement: t.achievement,
    fc: t.fc,
    fs: t.fs,
    dxScore: t.dxScore,
    maxDxScore: t.maxDxScore,
    details: t.details
      ? {
          fastCount: t.details.fastCount,
          lateCount: t.details.lateCount,
          tap: {
            criticalPerfect: t.details.tapCPerfect,
            perfect: t.details.tapPerfect,
            great: t.details.tapGreat,
            good: t.details.tapGood,
            miss: t.details.tapMiss,
          },
          hold: {
            criticalPerfect: t.details.holdCPerfect,
            perfect: t.details.holdPerfect,
            great: t.details.holdGreat,
            good: t.details.holdGood,
            miss: t.details.holdMiss,
          },
          slide: {
            criticalPerfect: t.details.slideCPerfect,
            perfect: t.details.slidePerfect,
            great: t.details.slideGreat,
            good: t.details.slideGood,
            miss: t.details.slideMiss,
          },
          touch: {
            criticalPerfect: t.details.touchCPerfect,
            perfect: t.details.touchPerfect,
            great: t.details.touchGreat,
            good: t.details.touchGood,
            miss: t.details.touchMiss,
          },
          break: {
            criticalPerfect: t.details.breakCPerfect,
            perfect: t.details.breakPerfect,
            great: t.details.breakGreat,
            good: t.details.breakGood,
            miss: t.details.breakMiss,
          },
        }
      : null,
  }));

  return {
    ok: true,
    message: {
      route: "last-credit",
      header,
      payload: {
        playedAt: Math.floor(result.credit.playedAt.getTime() / 1000),
        tracks,
      },
    },
  };
}

// ---- Daily plays ----

export type DailyPlaysResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; status: number; error: string };

export async function buildDailyPlaysMessage(opts: {
  userId: string;
  region: Region;
  day?: string;
  scale: 1 | 2;
  ttlSeconds?: number;
}): Promise<DailyPlaysResult> {
  const { userId, region, day, scale } = opts;
  const exp = expFromTtl(opts.ttlSeconds ?? DEFAULT_TTL);

  const result = await prepareDailyPlaysData(userId, region, day);
  if (result.type === "error") {
    return { ok: false, status: 404, error: result.error };
  }

  const header: RenderHeader = {
    scale,
    exp,
    gameVersion: result.snapshot.gameVersion as number,
    region,
    rating: result.snapshot.rating,
    displayName: result.snapshot.displayName,
    iconUrl: result.snapshot.iconUrl,
    title: result.snapshot.title,
    titleType: result.snapshot.titleType,
    classRankUrl: result.snapshot.classRankUrl,
    courseRankUrl: result.snapshot.courseRankUrl,
  };

  const plays: ChartRecord[] = result.plays.map((p) => ({
    songId: p.songPublicId,
    achievement: p.achievement,
    fc: p.fc,
    fs: p.fs,
  }));

  return {
    ok: true,
    message: {
      route: "daily-plays",
      header,
      payload: { day: result.day, plays },
    },
  };
}
