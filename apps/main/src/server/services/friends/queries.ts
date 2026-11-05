import "server-only";
import { and, eq, inArray, ne, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { friendHides, playerFriends, playerIdentities, user } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { isFriendMatch } from "./matching";

type Pair = {
  otherUserId: string;
  region: Region;
  mySyncedAt: Date | null;
  theirSyncedAt: Date | null;
  iName: boolean;
  theyName: boolean;
};

/**
 * The user's matched friends in a game, each with the regions they are friends in. Users who turned
 * friends off or hid each other are left out, on both sides.
 */
export async function findFriends(game: CanonicalGameId, userId: string): Promise<Map<string, Region[]>> {
  const [viewer] = await db.select({ enabled: user.friendsEnabled }).from(user).where(eq(user.id, userId)).limit(1);
  if (!viewer?.enabled) return new Map();

  const me = alias(playerIdentities, "me");
  const other = alias(playerIdentities, "other");
  const columns = {
    myId: me.id,
    otherId: other.id,
    otherUserId: other.userId,
    region: other.region,
    mySyncedAt: me.friendsSyncedAt,
    theirSyncedAt: other.friendsSyncedAt,
  };
  const mine = and(eq(me.userId, userId), eq(me.game, game), ne(other.userId, userId));

  const [named, namedBy] = await Promise.all([
    db.select(columns).from(me)
      .innerJoin(playerFriends, eq(playerFriends.identityId, me.id))
      .innerJoin(other, and(eq(other.game, me.game), eq(other.region, me.region), eq(other.codeHash, playerFriends.codeHash)))
      .where(mine),
    db.select(columns).from(me)
      .innerJoin(playerFriends, eq(playerFriends.codeHash, me.codeHash))
      .innerJoin(other, and(eq(other.id, playerFriends.identityId), eq(other.game, me.game), eq(other.region, me.region)))
      .where(mine),
  ]);

  const pairs = new Map<string, Pair>();
  for (const [rows, side] of [[named, "iName"], [namedBy, "theyName"]] as const) {
    for (const row of rows) {
      const key = `${row.myId}:${row.otherId}`;
      const pair = pairs.get(key) ?? { ...row, iName: false, theyName: false };
      pair[side] = true;
      pairs.set(key, pair);
    }
  }

  const matched = new Map<string, Region[]>();
  for (const pair of pairs.values()) {
    const friends = isFriendMatch(
      { syncedAt: pair.mySyncedAt, names: pair.iName },
      { syncedAt: pair.theirSyncedAt, names: pair.theyName },
    );
    if (friends) matched.set(pair.otherUserId, [...matched.get(pair.otherUserId) ?? [], pair.region]);
  }
  if (matched.size === 0) return matched;

  const allowed = await db
    .select({ id: user.id })
    .from(user)
    .where(and(
      inArray(user.id, [...matched.keys()]),
      eq(user.friendsEnabled, true),
      notExists(db.select().from(friendHides).where(or(
        and(eq(friendHides.userId, userId), eq(friendHides.hiddenUserId, user.id)),
        and(eq(friendHides.userId, user.id), eq(friendHides.hiddenUserId, userId)),
      ))),
    ));
  const allowedIds = new Set(allowed.map(row => row.id));
  return new Map([...matched].filter(([id]) => allowedIds.has(id)));
}

export async function areFriends(game: CanonicalGameId, userId: string, otherUserId: string): Promise<boolean> {
  if (userId === otherUserId) return false;
  return (await findFriends(game, userId)).has(otherUserId);
}
