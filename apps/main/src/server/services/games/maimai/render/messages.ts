/**
 * Builds `RenderMessage` DTOs from DB data, then mints signed tokens.
 *
 * This is the mint side of the render-token contract (see
 * @tomomai/render-token + docs/render-token-v2.md). apps/main does ALL the DB
 * work here; apps/render receives the signed token and joins catalog fields
 * from /api/v1/games/maimai/songs — zero DB access on the render side.
 *
 * The token carries user scores + header metadata (HMAC-signed, tamper-proof);
 * catalog fields (songName, cover, level, etc.) never travel in the token.
 */

import "server-only";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import type { GamePlayerScore, GameSnapshot } from "@/lib/games/player-view";
import { toMaimaiResult, toMaimaiSnapshotHeader } from "@/lib/games/maimai/legacy-view";
import { fetchSnapshotRankings, gameSnapshotColumns } from "@/server/queries/snapshots";
import {
  getReservedGameSnapshot,
  RESERVED_USERNAMES,
} from "../reserved";
import { prepareCreditData } from "./credit-data";
import { prepareDailyPlaysData } from "./daily-plays-data";
import type {
  ChartRecord,
  RenderHeader,
  RenderMessage,
  TrackRecord,
} from "@tomomai/render-token";

const DEFAULT_TTL = 300;

function expFromTtl(ttl: number): number {
  return Math.floor(Date.now() / 1000) + ttl;
}

function renderHeader(snapshot: GameSnapshot, region: Region, scale: 1 | 2, exp: number): RenderHeader {
  const header = toMaimaiSnapshotHeader(snapshot);
  return {
    scale,
    exp,
    gameVersion: header.gameVersion,
    region,
    rating: header.rating,
    displayName: header.displayName,
    iconUrl: header.iconUrl,
    title: header.title,
    titleType: header.titleType,
    classRankUrl: header.classRankUrl,
    courseRankUrl: header.courseRankUrl,
  };
}

function chartRecord(score: Pick<GamePlayerScore, "songId" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus">): ChartRecord {
  const { achievement, fc, fs } = toMaimaiResult(score);
  return { songId: score.songId, achievement, fc, fs };
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
    const reserved = await getReservedGameSnapshot(username.toLowerCase(), region);
    if (!reserved) {
      return { ok: false, status: 404, error: "Reserved profile not found" };
    }
    return {
      ok: true,
      message: {
        route: "export-image",
        header: renderHeader(reserved.snapshot, region, scale, exp),
        payload: { visitableProfileAt: username, charts: reserved.songs.map(chartRecord) },
      },
    };
  }

  // ---- normal DB path ----
  const [row] = await db
    .select({ userId: userSnapshots.userId, region: userSnapshots.region, snapshot: gameSnapshotColumns })
    .from(userSnapshots)
    .where(and(eq(userSnapshots.game, "maimai"), eq(userSnapshots.publicId, snapshotId)))
    .limit(1);

  if (!row) {
    return { ok: false, status: 404, error: "Snapshot not found" };
  }

  const [userRow, rankings] = await Promise.all([
    db
      .select({ username: user.username, publishProfile: user.publishProfile })
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1),
    fetchSnapshotRankings("maimai", row.userId, row.snapshot),
  ]);

  if (userRow.length === 0) {
    return { ok: false, status: 404, error: "User not found" };
  }

  const visitableProfileAt =
    userRow[0].publishProfile && userRow[0].username ? userRow[0].username : null;

  return {
    ok: true,
    message: {
      route: "export-image",
      header: renderHeader(row.snapshot, row.region, scale, exp),
      payload: { visitableProfileAt, charts: [...rankings.newScores, ...rankings.oldScores].map(chartRecord) },
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

  const tracks: TrackRecord[] = result.credit.tracks.map((t) => {
    const { achievement, dxScore, fc, fs } = toMaimaiResult(t);
    return {
      songId: t.songId,
      achievement,
      fc,
      fs,
      dxScore,
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
    };
  });

  return {
    ok: true,
    message: {
      route: "last-credit",
      header: renderHeader(result.snapshot, region, scale, exp),
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

  return {
    ok: true,
    message: {
      route: "daily-plays",
      header: renderHeader(result.snapshot, region, scale, exp),
      payload: { day: result.day, plays: result.plays.map(chartRecord) },
    },
  };
}
