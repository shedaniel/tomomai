import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";

dotenvConfig({ path: ".env.local" });

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("Error: POSTGRES_URL must be set in .env.local");
  process.exit(1);
}

const snapshotId = process.argv[2];
if (!snapshotId) {
  console.error("Usage: node scripts/verify-snapshot.js <snapshotId>");
  console.error("  snapshotId: the internal bigint ID from user_snapshots");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

try {
  // 1. Check snapshot exists (accept either internal id or publicId)
  const isNumeric = /^\d+$/.test(snapshotId);
  const [snapshot] = isNumeric
    ? await sql`SELECT id, "userId", region, "fetchedAt" FROM user_snapshots WHERE id = ${snapshotId}`
    : await sql`SELECT id, "userId", region, "fetchedAt" FROM user_snapshots WHERE "publicId" = ${snapshotId}`;
  if (!snapshot) {
    console.error(`Snapshot ${snapshotId} not found`);
    process.exit(1);
  }
  const internalId = snapshot.id;
  console.log(`Snapshot ${internalId} (${snapshotId}) | user=${snapshot.userId} region=${snapshot.region} fetched=${snapshot.fetchedAt}`);
  console.log("─".repeat(70));

  // 2. Count rows in each table
  const [oldCount] = await sql`SELECT COUNT(*)::int AS c FROM user_scores WHERE "snapshotId" = ${internalId}`;
  const [junctionCount] = await sql`SELECT COUNT(*)::int AS c FROM snapshot_scores WHERE "snapshotId" = ${internalId}`;
  const [b50Count] = await sql`SELECT COUNT(*)::int AS c FROM snapshot_b50 WHERE "snapshotId" = ${internalId}`;

  console.log(`user_scores:      ${oldCount.c} rows`);
  console.log(`snapshot_scores:  ${junctionCount.c} rows`);
  console.log(`snapshot_b50:     ${b50Count.c} rows`);
  console.log("─".repeat(70));

  let issues = 0;

  // 3. Junction count should match old scores count
  if (oldCount.c !== junctionCount.c) {
    console.log(`MISMATCH: user_scores (${oldCount.c}) != snapshot_scores (${junctionCount.c})`);
    issues++;
  } else {
    console.log(`OK: junction count matches user_scores (${oldCount.c})`);
  }

  // 4. B50 count should be <= 50
  if (b50Count.c > 50) {
    console.log(`MISMATCH: snapshot_b50 has ${b50Count.c} rows (expected <= 50)`);
    issues++;
  } else {
    console.log(`OK: snapshot_b50 has ${b50Count.c} rows`);
  }

  // 5. B50 count should match old B50 count
  const [oldB50Count] = await sql`SELECT COUNT(*)::int AS c FROM user_scores WHERE "snapshotId" = ${internalId} AND rank < 50`;
  if (oldB50Count.c !== b50Count.c) {
    console.log(`MISMATCH: old B50 (${oldB50Count.c}) != snapshot_b50 (${b50Count.c})`);
    issues++;
  } else {
    console.log(`OK: B50 count matches (${b50Count.c})`);
  }

  // 6. B50 ranks should be 0..N contiguous
  const b50Ranks = await sql`SELECT rank FROM snapshot_b50 WHERE "snapshotId" = ${internalId} ORDER BY rank`;
  const rankGaps = [];
  for (let i = 0; i < b50Ranks.length; i++) {
    if (b50Ranks[i].rank !== i) {
      rankGaps.push({ expected: i, got: b50Ranks[i].rank });
    }
  }
  if (rankGaps.length > 0) {
    console.log(`MISMATCH: B50 rank gaps: ${JSON.stringify(rankGaps.slice(0, 5))}...`);
    issues++;
  } else {
    console.log(`OK: B50 ranks are contiguous 0-${b50Ranks.length - 1}`);
  }

  // 7. Every B50 scoreId should also be in junction
  const [orphanB50] = await sql`
    SELECT COUNT(*)::int AS c FROM snapshot_b50 b
    LEFT JOIN snapshot_scores s ON b."snapshotId" = s."snapshotId" AND b."scoreId" = s."scoreId"
    WHERE b."snapshotId" = ${internalId} AND s."scoreId" IS NULL
  `;
  if (orphanB50.c > 0) {
    console.log(`MISMATCH: ${orphanB50.c} B50 rows not in junction table`);
    issues++;
  } else {
    console.log(`OK: all B50 scoreIds exist in junction`);
  }

  // 8. Spot-check: compare score data between old and new for B50 rows
  const comparison = await sql`
    WITH old_b50 AS (
      SELECT us."songId", us.achievement, us."dxScore", us.fc, us.fs, us.rank
      FROM user_scores us
      WHERE us."snapshotId" = ${internalId} AND us.rank < 50
    ),
    new_b50 AS (
      SELECT sd."songId", sd.achievement, sd."dxScore", sd.fc, sd.fs, b.rank
      FROM snapshot_b50 b
      JOIN score_data sd ON sd.id = b."scoreId"
      WHERE b."snapshotId" = ${internalId}
    )
    SELECT
      (SELECT COUNT(*)::int FROM old_b50) AS old_count,
      (SELECT COUNT(*)::int FROM new_b50) AS new_count,
      (SELECT COUNT(*)::int FROM old_b50 o
       JOIN new_b50 n ON o."songId" = n."songId" AND o.rank = n.rank
         AND o.achievement = n.achievement AND o."dxScore" = n."dxScore"
         AND o.fc = n.fc AND o.fs = n.fs
      ) AS matching
  `;
  const { old_count, new_count, matching } = comparison[0];
  if (matching !== old_count || matching !== new_count) {
    console.log(`MISMATCH: B50 data comparison — old=${old_count} new=${new_count} matching=${matching}`);
    issues++;
  } else {
    console.log(`OK: B50 data matches exactly (${matching} rows)`);
  }

  console.log("─".repeat(70));
  if (issues === 0) {
    console.log("ALL CHECKS PASSED");
  } else {
    console.log(`${issues} ISSUE(S) FOUND`);
  }
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
} finally {
  await sql.end();
}
