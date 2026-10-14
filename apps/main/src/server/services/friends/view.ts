import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendHides, playerIdentities, user, userSnapshots } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { gamePreference } from "@/server/queries/game-preferences";
import { latestSnapshot } from "@/server/queries/latest-snapshot";
import { findFriends } from "./queries";

export type FriendPlayer = { region: Region; displayName: string; rating: number; iconUrl: string };

export type FriendEntry = {
  userId: string;
  username: string | null;
  name: string;
  image: string | null;
  regions: Region[];
  /** The friend's latest player in one of the shared regions, only when the viewer may open their profile. */
  player: FriendPlayer | null;
};

export type HiddenFriend = Pick<FriendEntry, "userId" | "username" | "name" | "image">;

export type FriendsOverview = {
  enabled: boolean;
  /** The regions a friend list was saved for, with when. */
  synced: { region: Region; syncedAt: Date }[];
  friends: FriendEntry[];
  hidden: HiddenFriend[];
};

export async function friendsOverview(game: CanonicalGameId, userId: string): Promise<FriendsOverview> {
  const [[viewer], identities, matched, hidden] = await Promise.all([
    db.select({ enabled: user.friendsEnabled }).from(user).where(eq(user.id, userId)).limit(1),
    db.select({ region: playerIdentities.region, syncedAt: playerIdentities.friendsSyncedAt })
      .from(playerIdentities)
      .where(and(eq(playerIdentities.userId, userId), eq(playerIdentities.game, game))),
    findFriends(game, userId),
    db.select({ userId: user.id, username: user.username, name: user.name, image: user.image })
      .from(friendHides)
      .innerJoin(user, eq(user.id, friendHides.hiddenUserId))
      .where(eq(friendHides.userId, userId))
      .orderBy(desc(friendHides.createdAt)),
  ]);

  const rows = matched.size === 0 ? [] : await db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      image: user.image,
      publishProfile: user.publishProfile,
      profileShowInSearch: user.profileShowInSearch,
      profileShareWithFriends: user.profileShareWithFriends,
      mainRegion: gamePreference(game, "profileMainRegion"),
    })
    .from(user)
    .where(inArray(user.id, [...matched.keys()]));

  const friends = await Promise.all(rows.map(async (row): Promise<FriendEntry> => {
    const regions = matched.get(row.userId) ?? [];
    const visible = row.username !== null && ((row.publishProfile && row.profileShowInSearch) || row.profileShareWithFriends);
    const region = row.mainRegion && regions.includes(row.mainRegion) ? row.mainRegion : regions[0];
    const snapshot = visible && region
      ? await latestSnapshot(game, row.userId, region, {
        displayName: userSnapshots.displayName,
        rating: userSnapshots.rating,
        iconUrl: userSnapshots.iconUrl,
      })
      : null;
    return {
      userId: row.userId,
      username: visible ? row.username : null,
      name: row.name,
      image: row.image,
      regions,
      player: snapshot && region ? { region, ...snapshot } : null,
    };
  }));
  friends.sort((a, b) => (b.player?.rating ?? -1) - (a.player?.rating ?? -1) || a.name.localeCompare(b.name));

  return {
    enabled: viewer?.enabled ?? false,
    synced: identities.flatMap(({ region, syncedAt }) => syncedAt ? [{ region, syncedAt }] : []),
    friends,
    hidden,
  };
}
