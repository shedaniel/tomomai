import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/pg-core";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import { db } from "@/lib/db";
import { userSnapshots } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

/**
 * The given columns of the user's newest snapshot in a region, or null when they have none.
 * With `asOf`, the newest one fetched at or before that time. With `firstAfter`, instead the oldest one
 * fetched at or after that time, which is the fetch that imported plays made then.
 */
export async function latestSnapshot<TColumns extends SelectedFields>(
  game: CanonicalGameId,
  userId: string,
  region: Region,
  columns: TColumns,
  { asOf, firstAfter }: { asOf?: Date; firstAfter?: never } | { asOf?: never; firstAfter?: Date } = {},
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
      firstAfter ? gte(userSnapshots.fetchedAt, firstAfter) : undefined,
    ))
    .orderBy(firstAfter ? asc(userSnapshots.fetchedAt) : desc(userSnapshots.fetchedAt))
    .limit(1);
  return (row as SelectResultFields<TColumns> | undefined) ?? null;
}
