/**
 * Builds the CHUNITHM `RenderMessage`s apps/render draws (see @tomomai/render-token and
 * docs/render-token-v3.md). The token carries the scores, their codes and chart ratings.
 * apps/render joins the catalog fields from /api/v1/games/chunithm/songs.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import type { ChunithmChartRecord, ChunithmRenderHeader } from "@tomomai/render-token";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import type { Region } from "@/lib/games/ids";
import type { GamePlayerScore, GameSnapshot } from "@/lib/games/player-view";
import { rateScores } from "@/lib/games/ranking";
import { fetchSnapshotRankings, gameSnapshotColumns } from "@/server/queries/snapshots";
import { prepareDailyPlays } from "../../images/daily-plays";
import { renderTokenExpiry } from "../../images/expiry";
import type { DailyPlaysImageRequest, ExportImageRequest, ImageMessageResult } from "../../types";

type RatedScore = Pick<GamePlayerScore, "songId" | "scoreValue" | "comboStatus" | "syncStatus" | "clearStatus"> & { rating: number };

function renderHeader(snapshot: GameSnapshot, region: Region, scale: 1 | 2, exp: number): ChunithmRenderHeader {
  return {
    scale,
    exp,
    gameVersion: snapshot.gameVersion,
    region,
    rating: snapshot.rating,
    displayName: snapshot.displayName,
    iconUrl: snapshot.iconUrl,
    title: snapshot.title,
  };
}

function chartRecord({ songId, scoreValue, comboStatus, syncStatus, clearStatus, rating }: RatedScore): ChunithmChartRecord {
  return { songId, scoreValue, comboStatus, syncStatus, clearStatus, rating };
}

export async function buildExportImageMessage({ snapshotId, scale, ttlSeconds }: ExportImageRequest): Promise<ImageMessageResult> {
  const [row] = await db
    .select({ userId: userSnapshots.userId, region: userSnapshots.region, snapshot: gameSnapshotColumns })
    .from(userSnapshots)
    .where(and(eq(userSnapshots.game, "chunithm"), eq(userSnapshots.publicId, snapshotId)))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "Snapshot not found" };

  const [[owner], rankings] = await Promise.all([
    db.select({ username: user.username, publishProfile: user.publishProfile }).from(user).where(eq(user.id, row.userId)).limit(1),
    fetchSnapshotRankings("chunithm", row.userId, row.snapshot),
  ]);
  if (!owner) return { ok: false, status: 404, error: "User not found" };

  return {
    ok: true,
    message: {
      game: "chunithm",
      route: "export-image",
      header: renderHeader(row.snapshot, row.region, scale, renderTokenExpiry(ttlSeconds)),
      payload: {
        visitableProfileAt: owner.publishProfile && owner.username ? owner.username : null,
        newCharts: rankings.newScores.map(chartRecord),
        oldCharts: rankings.oldScores.map(chartRecord),
      },
    },
  };
}

export async function buildDailyPlaysMessage({ userId, region, day, scale, ttlSeconds }: DailyPlaysImageRequest): Promise<ImageMessageResult> {
  const result = await prepareDailyPlays("chunithm", userId, region, day);
  if (result.type === "error") return { ok: false, status: 404, error: result.error };

  return {
    ok: true,
    message: {
      game: "chunithm",
      route: "daily-plays",
      header: renderHeader(result.snapshot, region, scale, renderTokenExpiry(ttlSeconds)),
      payload: { day: result.day, plays: rateScores("chunithm", result.plays, result.snapshot.gameVersion).map(chartRecord) },
    },
  };
}
