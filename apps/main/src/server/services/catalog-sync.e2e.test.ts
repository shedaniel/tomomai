// End-to-end rehearsal for the catalog sync. Requires a served artifact and
// a migrated database; see docs/data-service.md. Run with:
//   CATALOG_SYNC_E2E=1 CATALOG_URL=http://localhost:8787 \
//   CATALOG_COVER_BASE_URL=https://covers.example.test POSTGRES_URL=... vitest run
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { syncCatalog } from "@/server/services/catalog-sync";

describe.skipIf(!process.env.CATALOG_SYNC_E2E)("catalog sync end-to-end", () => {
  it("loads the artifact, is idempotent, and protects referenced orphans", async () => {
    await db.execute(sql`DELETE FROM catalog_state`);
    await db.execute(sql`DELETE FROM score_data WHERE "songId" IN (9001, 9002)`);
    await db.execute(sql`DELETE FROM songs WHERE id IN (9001, 9002)`);

    // Orphan rows not present in the artifact: 9001 unreferenced (should be
    // deleted), 9002 referenced by scoreData (should be kept)
    await db.execute(sql`INSERT INTO songs (id, "parentId", level, "levelPrecise", region, "gameVersion", "addedVersion")
      VALUES (9001, 1, '10', 100, 'intl', 12, 0), (9002, 1, '10', 100, 'intl', 11, 0)`);
    await db.execute(sql`INSERT INTO score_data ("songId", achievement, "dxScore", fc, fs) VALUES (9002, 990000, 1000, 'none', 'none')`);

    const first = await syncCatalog();
    expect(first.skipped).toBe(false);
    if (!first.skipped) {
      expect(first.sequence).toBe(1);
      expect(first.parents).toBe(5);
      expect(first.songs).toBe(10);
      expect(first.deletedSongs).toBe(1);
      expect(first.keptOrphanSongs).toBe(1);
    }

    const gone = await db.execute(sql`SELECT id FROM songs WHERE id = 9001`);
    expect([...gone]).toHaveLength(0);
    const kept = await db.execute(sql`SELECT id FROM songs WHERE id = 9002`);
    expect([...kept]).toHaveLength(1);

    const counts = await db.execute(sql`SELECT (SELECT COUNT(*)::int FROM parent_song) AS parents, (SELECT COUNT(*)::int FROM songs) AS songs`);
    expect([...counts][0]).toEqual({ parents: 5, songs: 11 }); // 10 from artifact + kept orphan

    // Cover keys resolved against the cover base URL
    const cover = await db.execute(sql`SELECT cover FROM parent_song WHERE id = 1`);
    expect(([...cover][0] as { cover: string }).cover).toMatch(/^https:\/\/covers\.example\.test\//);

    const second = await syncCatalog();
    expect(second.skipped).toBe(true);
  }, 30000);
});
