import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";

dotenvConfig({ path: ".env.local" });

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("Error: POSTGRES_URL must be set in .env.local");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

try {
  console.log("Verifying backfill correctness...\n");

  // 1. Overview counts
  const [snapshotCount] = await sql`SELECT COUNT(*)::int AS c FROM user_snapshots`;
  const [oldScoreCount] = await sql`SELECT COUNT(*)::int AS c FROM user_scores`;
  const [scoreDataCount] = await sql`SELECT COUNT(*)::int AS c FROM score_data`;
  const [junctionCount] = await sql`SELECT COUNT(*)::int AS c FROM snapshot_scores`;
  const [b50Count] = await sql`SELECT COUNT(*)::int AS c FROM snapshot_b50`;

  console.log("Table counts:");
  console.log(`  user_snapshots:  ${snapshotCount.c}`);
  console.log(`  user_scores:     ${oldScoreCount.c}`);
  console.log(`  score_data:      ${scoreDataCount.c}`);
  console.log(`  snapshot_scores: ${junctionCount.c}`);
  console.log(`  snapshot_b50:    ${b50Count.c}`);
  console.log("─".repeat(60));

  let issues = 0;

  // 2. Total junction rows should equal total old scores
  if (oldScoreCount.c !== junctionCount.c) {
    console.log(`MISMATCH: user_scores total (${oldScoreCount.c}) != snapshot_scores total (${junctionCount.c})`);
    issues++;
  } else {
    console.log(`OK: total junction rows match user_scores (${oldScoreCount.c})`);
  }

  // 3. Snapshots missing junction rows (excluding empty snapshots with no old scores)
  const missingJunction = await sql`
    SELECT s.id, s."publicId", s.region
    FROM user_snapshots s
    LEFT JOIN snapshot_scores ss ON s.id = ss."snapshotId"
    WHERE ss."snapshotId" IS NULL
      AND EXISTS (SELECT 1 FROM user_scores us WHERE us."snapshotId" = s.id)
  `;
  const emptySnapshots = await sql`
    SELECT COUNT(*)::int AS c FROM user_snapshots s
    WHERE NOT EXISTS (SELECT 1 FROM user_scores us WHERE us."snapshotId" = s.id)
  `;
  if (missingJunction.length > 0) {
    console.log(`MISMATCH: ${missingJunction.length} non-empty snapshots have NO junction rows:`);
    for (const s of missingJunction.slice(0, 10)) {
      console.log(`  id=${s.id} publicId=${s.publicId} region=${s.region}`);
    }
    if (missingJunction.length > 10) console.log(`  ... and ${missingJunction.length - 10} more`);
    issues++;
  } else {
    console.log(`OK: all non-empty snapshots have junction rows (${emptySnapshots[0].c} empty snapshots skipped)`);
  }

  // 4. Snapshots missing B50 rows (excluding those with no B50 in old table)
  const missingB50 = await sql`
    SELECT s.id, s."publicId", s.region
    FROM user_snapshots s
    LEFT JOIN snapshot_b50 b ON s.id = b."snapshotId"
    WHERE b."snapshotId" IS NULL
      AND EXISTS (SELECT 1 FROM user_scores us WHERE us."snapshotId" = s.id AND us.rank IS NOT NULL AND us.rank < 50)
  `;
  const noB50Snapshots = await sql`
    SELECT COUNT(*)::int AS c FROM user_snapshots s
    WHERE NOT EXISTS (SELECT 1 FROM user_scores us WHERE us."snapshotId" = s.id AND us.rank IS NOT NULL AND us.rank < 50)
  `;
  if (missingB50.length > 0) {
    console.log(`MISMATCH: ${missingB50.length} snapshots with old B50 data have NO new B50 rows:`);
    for (const s of missingB50.slice(0, 10)) {
      console.log(`  id=${s.id} publicId=${s.publicId} region=${s.region}`);
    }
    if (missingB50.length > 10) console.log(`  ... and ${missingB50.length - 10} more`);
    issues++;
  } else {
    console.log(`OK: all snapshots with B50 data have B50 rows (${noB50Snapshots[0].c} without B50 skipped)`);
  }

  // 5. Per-snapshot junction count vs old scores count (find mismatches)
  const countMismatches = await sql`
    SELECT
      s.id,
      s."publicId",
      COALESCE(old.cnt, 0)::int AS old_count,
      COALESCE(new.cnt, 0)::int AS new_count
    FROM user_snapshots s
    LEFT JOIN (
      SELECT "snapshotId", COUNT(*) AS cnt FROM user_scores GROUP BY "snapshotId"
    ) old ON old."snapshotId" = s.id
    LEFT JOIN (
      SELECT "snapshotId", COUNT(*) AS cnt FROM snapshot_scores GROUP BY "snapshotId"
    ) new ON new."snapshotId" = s.id
    WHERE COALESCE(old.cnt, 0) != COALESCE(new.cnt, 0)
  `;
  if (countMismatches.length > 0) {
    console.log(`MISMATCH: ${countMismatches.length} snapshots have different score counts:`);
    for (const m of countMismatches.slice(0, 10)) {
      console.log(`  id=${m.id} (${m.publicId}): old=${m.old_count} new=${m.new_count}`);
    }
    if (countMismatches.length > 10) console.log(`  ... and ${countMismatches.length - 10} more`);
    issues++;
  } else {
    console.log(`OK: all snapshots have matching score counts`);
  }

  // 6. Per-snapshot B50 count vs old B50 count
  const b50Mismatches = await sql`
    SELECT
      s.id,
      s."publicId",
      COALESCE(old.cnt, 0)::int AS old_count,
      COALESCE(new.cnt, 0)::int AS new_count
    FROM user_snapshots s
    LEFT JOIN (
      SELECT "snapshotId", COUNT(*) AS cnt FROM user_scores WHERE rank IS NOT NULL AND rank < 50 GROUP BY "snapshotId"
    ) old ON old."snapshotId" = s.id
    LEFT JOIN (
      SELECT "snapshotId", COUNT(*) AS cnt FROM snapshot_b50 GROUP BY "snapshotId"
    ) new ON new."snapshotId" = s.id
    WHERE COALESCE(old.cnt, 0) != COALESCE(new.cnt, 0)
  `;
  if (b50Mismatches.length > 0) {
    console.log(`MISMATCH: ${b50Mismatches.length} snapshots have different B50 counts:`);
    for (const m of b50Mismatches.slice(0, 10)) {
      console.log(`  id=${m.id} (${m.publicId}): old=${m.old_count} new=${m.new_count}`);
    }
    if (b50Mismatches.length > 10) console.log(`  ... and ${b50Mismatches.length - 10} more`);
    issues++;
  } else {
    console.log(`OK: all snapshots have matching B50 counts`);
  }

  // 7. Spot-check B50 data integrity (sample 20 random snapshots)
  const sampleSnapshots = await sql`
    SELECT id FROM user_snapshots ORDER BY random() LIMIT 20
  `;
  let spotCheckFails = 0;
  for (const { id } of sampleSnapshots) {
    const [result] = await sql`
      WITH old_b50 AS (
        SELECT "songId", achievement, "dxScore", fc, fs, rank
        FROM user_scores
        WHERE "snapshotId" = ${id} AND rank IS NOT NULL AND rank < 50
      ),
      new_b50 AS (
        SELECT sd."songId", sd.achievement, sd."dxScore", sd.fc, sd.fs, b.rank
        FROM snapshot_b50 b
        JOIN score_data sd ON sd.id = b."scoreId"
        WHERE b."snapshotId" = ${id}
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
    if (result.matching !== result.old_count || result.matching !== result.new_count) {
      console.log(`  SPOT-CHECK FAIL snapshot ${id}: old=${result.old_count} new=${result.new_count} matching=${result.matching}`);
      spotCheckFails++;
    }
  }
  if (spotCheckFails > 0) {
    console.log(`MISMATCH: ${spotCheckFails}/20 spot-checked snapshots have B50 data mismatches`);
    issues++;
  } else {
    console.log(`OK: B50 data spot-check passed (20 random snapshots)`);
  }

  // 8. Orphan check: B50 scoreIds not in junction
  const [orphanB50] = await sql`
    SELECT COUNT(*)::int AS c FROM snapshot_b50 b
    LEFT JOIN snapshot_scores s ON b."snapshotId" = s."snapshotId" AND b."scoreId" = s."scoreId"
    WHERE s."scoreId" IS NULL
  `;
  if (orphanB50.c > 0) {
    console.log(`MISMATCH: ${orphanB50.c} B50 rows reference scoreIds not in junction`);
    issues++;
  } else {
    console.log(`OK: all B50 scoreIds exist in junction`);
  }

  // 9. Dangling scoreIds in junction (scoreData deleted?)
  const [danglingJunction] = await sql`
    SELECT COUNT(*)::int AS c FROM snapshot_scores ss
    LEFT JOIN score_data sd ON sd.id = ss."scoreId"
    WHERE sd.id IS NULL
  `;
  if (danglingJunction.c > 0) {
    console.log(`MISMATCH: ${danglingJunction.c} junction rows reference missing score_data`);
    issues++;
  } else {
    console.log(`OK: all junction scoreIds reference existing score_data`);
  }

  console.log("─".repeat(60));
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
