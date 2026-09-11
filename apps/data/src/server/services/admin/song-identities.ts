import type { db } from "@/lib/db";
import { retiredSongIds, songs } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SongValues = typeof songs.$inferInsert;
const identityKey = (row: Pick<typeof songs.$inferSelect, "parentId" | "region" | "gameVersion">) => `${row.parentId}:${row.region}:${row.gameVersion}`;

export async function restoreSongIds(tx: Transaction, rows: SongValues[]): Promise<SongValues[]> {
  if (rows.length === 0) return rows;
  const retired = await tx.select().from(retiredSongIds).where(inArray(retiredSongIds.parentId, rows.map(row => row.parentId)));
  const ids = new Map(retired.map(row => [identityKey(row), row.id]));
  return rows.map(row => ({ ...row, id: ids.get(identityKey(row)) ?? row.id }));
}

export async function retireSongs(tx: Transaction, ids: bigint[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await tx.select({ id: songs.id, parentId: songs.parentId, region: songs.region, gameVersion: songs.gameVersion })
    .from(songs).where(inArray(songs.id, ids));
  // Preserve IDs after removal so returning charts can reconnect local user references.
  if (rows.length > 0) await tx.insert(retiredSongIds).values(rows).onConflictDoNothing();
  const deleted = await tx.delete(songs).where(inArray(songs.id, ids)).returning({ id: songs.id });
  return deleted.length;
}
