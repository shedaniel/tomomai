import { and, desc, eq, lte } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/pg-core";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import { db } from "@/lib/db";
import { userSnapshots } from "@/lib/db/schema-pg";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

/**
 * The given columns of the user's newest snapshot in a region, or null when they have none.
 * With `asOf`, the newest one fetched at or before that time.
 */
export async function latestSnapshot<TColumns extends SelectedFields>(
  game: CanonicalGameId,
  userId: string,
  region: Region,
  columns: TColumns,
  { asOf }: { asOf?: Date } = {},
): Promise<SelectResultFields<TColumns> | null> {
  // Drizzle cannot type a select over a generic selection, so the result is typed from TColumns instead.
  const selection: SelectedFields = columns;
  const [row] = await db
    .select(selection)
    .from(userSnapshots)
    .where(and(
      eq(userSnapshots.game, game),
      eq(userSnapshots.userId, userId),
      eq(userSnapshots.region, region),
      asOf ? lte(userSnapshots.fetchedAt, asOf) : undefined,
    ))
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);
  return (row as SelectResultFields<TColumns> | undefined) ?? null;
}
