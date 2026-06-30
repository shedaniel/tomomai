import { db } from "@/lib/db";
import {
  CHART_PERCENTILE_VIEW,
  CREATE_CHART_PERCENTILE_INDEX_SQL,
  CREATE_CHART_PERCENTILE_VIEW_SQL,
  ChartPercentileBandRow,
} from "@/lib/db/percentile-view";
import { sql } from "drizzle-orm";

const CHART_PERCENTILE_TIMEOUT_MS = 5000;

// 42P01 = undefined_table (matview not built yet), 57014 = query_canceled (statement_timeout).
function hasPgCode(err: unknown, code: string): boolean {
  for (let e: unknown = err; e != null; e = (e as { cause?: unknown }).cause) {
    if (typeof e === "object" && (e as { code?: string }).code === code) return true;
  }
  return false;
}

export interface ChartPercentileInput {
  internalSongId: bigint;
  /** achievement stored as integer ×10000 (e.g. 1000000 = 100.0000%) */
  achievement: number;
}

export interface DistributionBucket {
  /** lower bound of bucket (achievement ×10000) */
  lo: number;
  count: number;
}

export interface ChartPercentileResult {
  /** 0.0–1.0; 0.0 = lowest scorer, 1.0 = highest scorer among peers */
  percentile: number;
  /** merged distinct player count used for this calculation */
  peerCount: number;
  /** pre-binned score distribution for the hover-card chart */
  distribution: DistributionBucket[];
}

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
  return { lo: centre - 375, hi: centre + 500 };
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

/** Merge N pre-sorted arrays into one sorted array. */
function mergeSorted(arrays: number[][]): number[] {
  const result: number[] = [];
  for (const arr of arrays) result.push(...arr);
  result.sort((a, b) => a - b);
  return result;
}

/** Bin a sorted array into ~numBuckets uniform buckets across its range. */
function buildDistribution(sorted: number[], numBuckets = 20): DistributionBucket[] {
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [{ lo: min, count: sorted.length }];

  const step = (max - min) / numBuckets;
  const buckets: DistributionBucket[] = Array.from({ length: numBuckets }, (_, i) => ({
    lo: Math.round(min + i * step),
    count: 0,
  }));

  for (const v of sorted) {
    const idx = Math.min(Math.floor((v - min) / step), numBuckets - 1);
    buckets[idx].count++;
  }

  return buckets;
}

const MIN_PEERS_DISPLAY = 30;
const MIN_PEERS_EXPAND = 20;

/**
 * For up to 60 (song, achievement) pairs and a user rating, returns the
 * percentile for each chart that has enough peers. Charts below the peer
 * threshold are omitted from the result map.
 *
 * Makes a single DB round-trip by fetching all 8 bands for all songs at once,
 * then decides per-song whether to use the ±250 or ±500 window.
 */
export async function getChartPercentiles(
  inputs: ChartPercentileInput[],
  userRating: number,
): Promise<Map<bigint, ChartPercentileResult>> {
  if (inputs.length === 0) return new Map();

  const songIds = inputs.map((i) => i.internalSongId);
  const { lo, hi } = getBandRange(userRating);
  const primary = new Set(primaryBands(userRating));

  // Single query: all bands for all songs in the ±500 window.
  // statement_timeout bounds the read so a slow/contended matview can't hang the request.
  let rows: ChartPercentileBandRow[];
  try {
    rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${CHART_PERCENTILE_TIMEOUT_MS}`));
      return tx.execute<ChartPercentileBandRow>(sql`
        SELECT song_id, band_lo, achievements, player_count
        FROM ${sql.raw(CHART_PERCENTILE_VIEW)}
        WHERE song_id = ANY(${sql.raw(`ARRAY[${songIds.map(String).join(",")}]::bigint[]`)})
          AND band_lo >= ${lo}
          AND band_lo < ${hi}
      `);
    });
  } catch (err) {
    // Matview not built yet (cron never ran) or query timed out — degrade to no data.
    if (hasPgCode(err, "42P01") || hasPgCode(err, "57014")) return new Map();
    throw err;
  }

  // Group rows by song_id
  const byId = new Map<bigint, ChartPercentileBandRow[]>();
  for (const row of rows) {
    const id = BigInt(row.song_id);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(row);
  }

  const result = new Map<bigint, ChartPercentileResult>();

  for (const { internalSongId, achievement } of inputs) {
    const allBands = byId.get(internalSongId) ?? [];

    // Try ±250 first
    let bands = allBands.filter((r) => primary.has(r.band_lo));
    let peerCount = bands.reduce((s, r) => s + r.player_count, 0);

    // Expand to ±500 if not enough peers
    if (peerCount < MIN_PEERS_EXPAND) {
      bands = allBands;
      peerCount = bands.reduce((s, r) => s + r.player_count, 0);
    }

    if (peerCount < MIN_PEERS_DISPLAY) continue;

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
    if (dominant > 3 * (minority + 1)) continue;

    const merged = mergeSorted(bands.map((r) => r.achievements));
    const rank = rankBelow(merged, achievement);
    const percentile = merged.length > 0 ? rank / merged.length : 0;
    const distribution = buildDistribution(merged);

    result.set(internalSongId, { percentile, peerCount, distribution });
  }

  return result;
}
