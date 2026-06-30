import { db } from "@/lib/db";
import { policyAcceptance } from "@/lib/db/schema-pg";
import { eq, sql } from "drizzle-orm";
import type { LegalType } from "@/lib/legal";

/**
 * The latest accepted version per doc type for a user, read from the
 * policyAcceptance audit log (the single source of truth). Versions are
 * "YYYYMMDD" strings so MAX() gives the newest. null = never accepted.
 */
export async function getAcceptedPolicyVersions(
  userId: string,
): Promise<Record<LegalType, string | null>> {
  const rows = await db
    .select({
      docType: policyAcceptance.docType,
      version: sql<string>`max(${policyAcceptance.version})`,
    })
    .from(policyAcceptance)
    .where(eq(policyAcceptance.userId, userId))
    .groupBy(policyAcceptance.docType);

  const result: Record<LegalType, string | null> = { tos: null, privacy: null };
  for (const row of rows) {
    result[row.docType as LegalType] = row.version ?? null;
  }
  return result;
}
