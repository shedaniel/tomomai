import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendHides, playerFriends, playerIdentities, user } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import type { Logger } from "pino";
import { hashFriendCode } from "./codes";

const RESYNC_MS = 20 * 60 * 60 * 1000;

/** Whether a fetch should read the player's friend list: the user has friends on and it was not read in the last day. */
export async function friendSyncDue(userId: string, game: CanonicalGameId, region: Region, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ enabled: user.friendsEnabled, syncedAt: playerIdentities.friendsSyncedAt })
    .from(user)
    .leftJoin(playerIdentities, and(
      eq(playerIdentities.userId, user.id),
      eq(playerIdentities.game, game),
      eq(playerIdentities.region, region),
    ))
    .where(eq(user.id, userId))
    .limit(1);
  if (!row?.enabled) return false;
  return !row.syncedAt || now.getTime() - row.syncedAt.getTime() >= RESYNC_MS;
}

export type PlayerFriendData = {
  /** The signed-in player's own friend code. */
  friendCode: string;
  /** The friend codes on the player's in-game friend list. */
  friendCodes: string[];
};

/**
 * Saves the player a fetch signed in as and their whole friend list. A friend code belongs to the
 * account that last fetched it, so it moves off any other account that held it.
 */
export async function savePlayerFriends(
  input: { userId: string; game: CanonicalGameId; region: Region } & PlayerFriendData,
  /** Bound to the fetch's user, game and region. */
  log: Logger,
  now = new Date(),
): Promise<void> {
  const { userId, game, region } = input;
  const codeHash = hashFriendCode(game, input.friendCode);
  const friendHashes = [...new Set(input.friendCodes.map(code => hashFriendCode(game, code)))].filter(hash => hash !== codeHash);

  const moved = await db.transaction(async tx => {
    const taken = await tx
      .delete(playerIdentities)
      .where(and(
        eq(playerIdentities.game, game),
        eq(playerIdentities.region, region),
        eq(playerIdentities.codeHash, codeHash),
        ne(playerIdentities.userId, userId),
      ))
      .returning({ userId: playerIdentities.userId });
    const [identity] = await tx
      .insert(playerIdentities)
      .values({ userId, game, region, codeHash, friendsSyncedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [playerIdentities.userId, playerIdentities.game, playerIdentities.region],
        set: { codeHash, friendsSyncedAt: now, updatedAt: now },
      })
      .returning({ id: playerIdentities.id });
    await tx.delete(playerFriends).where(eq(playerFriends.identityId, identity!.id));
    if (friendHashes.length > 0) {
      await tx.insert(playerFriends).values(friendHashes.map(hash => ({ identityId: identity!.id, codeHash: hash })));
    }
    return taken.length;
  });

  if (moved > 0) log.info({ count: moved }, "Friend code moved to this account from another");
}

/** Turning friends off forgets every saved player and friend list of the user. */
export async function setFriendsEnabled(userId: string, enabled: boolean): Promise<void> {
  await db.transaction(async tx => {
    await tx.update(user).set({ friendsEnabled: enabled, updatedAt: new Date() }).where(eq(user.id, userId));
    if (!enabled) await tx.delete(playerIdentities).where(eq(playerIdentities.userId, userId));
  });
}

export async function hideFriend(userId: string, hiddenUserId: string): Promise<void> {
  if (userId === hiddenUserId) return;
  await db.insert(friendHides).values({ userId, hiddenUserId }).onConflictDoNothing();
}

export async function unhideFriends(userId: string, hiddenUserIds: string[]): Promise<void> {
  if (hiddenUserIds.length === 0) return;
  await db.delete(friendHides).where(and(eq(friendHides.userId, userId), inArray(friendHides.hiddenUserId, hiddenUserIds)));
}
