import { sql } from "drizzle-orm";
import type { db } from "@/lib/db";

export type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One lock serializes every catalog write with publication, so a publisher never reads a half-applied write.
export const CATALOG_WRITE_LOCK_ID = 73641932;

export function lockCatalogWrites(tx: Pick<CatalogTransaction, "execute">) {
  return tx.execute(sql`select pg_advisory_xact_lock(${sql.raw(String(CATALOG_WRITE_LOCK_ID))})`);
}
