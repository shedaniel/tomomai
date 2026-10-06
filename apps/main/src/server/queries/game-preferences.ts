import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, userGamePreferences } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

type GamePreferences = { region: Region | null; profileMainRegion: Region | null };

/**
 * The user's preference for `game`, as a column of a select from `user`. Null until the user picks one on
 * that game's site; readers clamp it to the game's enabled regions with getGameRegion.
 */
export function gamePreference<K extends keyof GamePreferences>(game: CanonicalGameId, key: K): SQL<GamePreferences[K]> {
  // A nested fragment keeps its columns table-qualified. A single-table select strips the qualifier from top-level ones.
  const chosen = sql`select ${userGamePreferences[key]} from ${userGamePreferences} where ${userGamePreferences.userId} = ${user.id} and ${userGamePreferences.game} = ${game}`;
  return sql<GamePreferences[K]>`(${chosen})`;
}

export async function saveGamePreference(
  game: CanonicalGameId,
  userId: string,
  preference: { region: Region } | { profileMainRegion: Region },
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(userGamePreferences)
    .values({ userId, game, ...preference, updatedAt })
    .onConflictDoUpdate({
      target: [userGamePreferences.userId, userGamePreferences.game],
      set: { ...preference, updatedAt },
    });
}
