import { db } from "@/lib/db";
import {
  CHART_PERCENTILE_VIEW,
  CREATE_CHART_PERCENTILE_INDEX_SQL,
  CREATE_CHART_PERCENTILE_VIEW_SQL,
  ChartPercentileBandRow,
} from "@/lib/db/percentile-view";
import { sql } from "drizzle-orm";
import type { PercentileEntry, PercentileBucket, RatingScoreBucket } from "@/lib/percentile-types";

const CHART_PERCENTILE_TIMEOUT_MS = 5000;

// 42P01 = undefined_table (matview not built yet), 57014 = query_canceled (statement_timeout).
function hasPgCode(err: unknown, code: string): boolean {
  for (let e: unknown = err; e != null; e = (e as { cause?: unknown }).cause) {
    if (typeof e === "object" && (e as { code?: string }).code === code) return true;
  }
  return false;
}

export interface ChartPercentileInput {
  publicSongId: string;
  /** parent_song.id — the chart's canonical, version-independent identity */
  parentId: bigint;
  /** achievement stored as integer ×10000 (e.g. 1000000 = 100.0000%) */
  achievement: number;
}

export type ChartPercentileResult = PercentileEntry;

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

export async function rebuildChartPercentileBands(): Promise<{ rowsInserted: number }> {
  // First run: creates the view. Subsequent runs: no-op (IF NOT EXISTS).
  await db.execute(sql.raw(CREATE_CHART_PERCENTILE_VIEW_SQL));
  // First run: creates the unique index needed for CONCURRENTLY. Subsequent: no-op.
  await db.execute(sql.raw(CREATE_CHART_PERCENTILE_INDEX_SQL));
  // Refreshes without holding a read lock, so queries can still run during the rebuild.
  await db.execute(sql.raw(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${CHART_PERCENTILE_VIEW}`));

  const result = await db.execute<{ count: string; [key: string]: unknown }>(
    sql.raw(`SELECT COUNT(*)::text AS count FROM ${CHART_PERCENTILE_VIEW}`)
  );
  return { rowsInserted: parseInt(result[0].count, 10) };
}

// ---------------------------------------------------------------------------
// Batch percentile lookup
// ---------------------------------------------------------------------------

/** ±500 band set: 8 consecutive 125-wide bands centred on the user's rating. */
function getBandRange(userRating: number): { lo: number; hi: number } {
  const centre = Math.floor(userRating / 125) * 125;
  return { lo: centre - 375, hi: centre + 625 };
}

/** 4-band (±250) band list */
function primaryBands(userRating: number): number[] {
  const centre = Math.floor(userRating / 125) * 125;
  return [centre - 125, centre, centre + 125, centre + 250];
}

/** Binary search on a sorted numeric array; returns the number of elements < target */
function rankBelow(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildDistribution(bands: ChartPercentileBandRow[]): PercentileBucket[] {
  const counts = new Map<number, number>();
  for (const band of bands) {
    // Each sampled score represents its share of the band's full player count.
    const weight = band.player_count / band.achievements.length;
    for (const score of band.achievements) {
      counts.set(score, (counts.get(score) ?? 0) + weight);
    }
  }
  return [...counts].sort(([a], [b]) => a - b).map(([lo, count]) => ({ lo, count }));
}

function buildRatingDistribution(bands: ChartPercentileBandRow[]): RatingScoreBucket[] {
  return bands.flatMap((band) => {
    const counts = new Map<number, number>();
    for (const score of band.achievements) {
      const lo = Math.floor(score / 1000) * 1000;
      counts.set(lo, (counts.get(lo) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a - b).map(([achievementLo, count]) => ({
      ratingLo: band.band_lo, achievementLo, count,
    }));
  });
}

const MIN_PEERS_DISPLAY = 30;
const MIN_PEERS_EXPAND = MIN_PEERS_DISPLAY;

/**
 * For up to 60 charts, returns all-rating score clusters and a peer comparison
 * when enough balanced nearby rating bands are available.
 *
 * Makes a single DB round-trip by fetching all rating bands for all charts,
 * then decides per-chart whether to use the ±250 or ±500 window.
 */
export async function getChartPercentiles(
  inputs: ChartPercentileInput[],
  userRating: number,
  nearbyOnly = false,
): Promise<Map<string, ChartPercentileResult>> {
  if (inputs.length === 0) return new Map();

  const parentIds = [...new Set(inputs.map((i) => i.parentId))];
  const { lo, hi } = getBandRange(userRating);
  const primary = new Set(primaryBands(userRating));

  // All rating bands also feed the rating-versus-achievement plot.
  // statement_timeout bounds the read so a slow/contended matview can't hang the request.
  let rows: ChartPercentileBandRow[];
  try {
    rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${CHART_PERCENTILE_TIMEOUT_MS}`));
      return tx.execute<ChartPercentileBandRow>(sql`
        SELECT parent_id, band_lo, achievements, player_count
        FROM ${sql.raw(CHART_PERCENTILE_VIEW)}
        WHERE parent_id = ANY(${sql.raw(`ARRAY[${parentIds.map(String).join(",")}]::bigint[]`)})
          ${nearbyOnly ? sql`AND band_lo >= ${lo} AND band_lo < ${hi}` : sql``}
      `);
    });
  } catch (err) {
    // Matview not built yet (cron never ran) or query timed out — degrade to no data.
    if (hasPgCode(err, "42P01") || hasPgCode(err, "57014")) return new Map();
    throw err;
  }

  // Group rows by parent_id
  const byId = new Map<bigint, ChartPercentileBandRow[]>();
  for (const row of rows) {
    const id = BigInt(row.parent_id);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(row);
  }

  const result = new Map<string, ChartPercentileResult>();

  for (const { publicSongId, parentId, achievement } of inputs) {
    const chartBands = (byId.get(parentId) ?? []).filter((band) => band.achievements.length > 0);
    if (!chartBands.length) continue;
    const allBands = chartBands.filter((band) => band.band_lo >= lo && band.band_lo < hi);

    // Try ±250 first
    let bands = allBands.filter((r) => primary.has(r.band_lo));
    let peerCount = bands.reduce((s, r) => s + r.player_count, 0);

    // Expand to ±500 if not enough peers
    if (peerCount < MIN_PEERS_EXPAND) {
      bands = allBands;
      peerCount = bands.reduce((s, r) => s + r.player_count, 0);
    }



    // Guard: if the peer pool is heavily skewed toward higher- or lower-rated
    // bands, the merged score distribution is shifted away from the user's true
    // tier and the percentile would be misleading.
    // Example: 5 below-band peers vs 45 above-band peers → above-rated players
    // score higher, pushing the user's percentile down artificially.
    const centre = Math.floor(userRating / 125) * 125;
    const abovePeers = bands
      .filter((b) => b.band_lo > centre)
      .reduce((s, b) => s + b.player_count, 0);
    const belowAndOwnPeers = peerCount - abovePeers;
    const dominant = Math.max(abovePeers, belowAndOwnPeers);
    const minority = Math.min(abovePeers, belowAndOwnPeers);
    // 3:1 threshold — one side must not outnumber the other by more than 3×
    const hasPeers = peerCount >= MIN_PEERS_DISPLAY && dominant <= 3 * (minority + 1);
    const rank = hasPeers ? bands.reduce((sum, band) =>
      sum + rankBelow(band.achievements, achievement) / band.achievements.length * band.player_count, 0) : 0;

    result.set(publicSongId, {
      userRating,
      percentile: hasPeers ? rank / peerCount : null,
      peerCount,
      distribution: hasPeers ? buildDistribution(bands) : [],
      ratingDistribution: nearbyOnly ? [] : buildRatingDistribution(chartBands),
      totalPlayerCount: chartBands.reduce((sum, band) => sum + band.player_count, 0),
      peerRatingRange: hasPeers ? {
        min: Math.min(...bands.map((band) => band.band_lo)),
        max: Math.max(...bands.map((band) => band.band_lo)) + 124,
      } : null,
    });
  }

  return result;
}
