import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendHides, playerIdentities, user, userSnapshots } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { gamePreference } from "@/server/queries/game-preferences";
import { latestSnapshot } from "@/server/queries/latest-snapshot";
import { querySongScoresOf, type SongQuery } from "@/server/queries/songs";
import type { UserScore } from "@/components/db/songs/types";
import { profileAudienceColumns } from "@/server/queries/public-access";
import { privacyFor, profileViewer } from "@/lib/profile-audience";
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

async function readFriendRows(game: CanonicalGameId, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      image: user.image,
      audiences: profileAudienceColumns,
      mainRegion: gamePreference(game, "profileMainRegion"),
    })
    .from(user)
    .where(inArray(user.id, ids));
}

type FriendRow = Awaited<ReturnType<typeof readFriendRows>>[number];

/** Matches resolvePublicUserByUsername: a friend opens any profile that is not private. */
function mayOpen(row: FriendRow): row is FriendRow & { username: string } {
  return row.username !== null && profileViewer(row.audiences.profileVisibility, true) !== null;
}

function shownRegion(row: FriendRow, regions: Region[]): Region | undefined {
  return row.mainRegion && regions.includes(row.mainRegion) ? row.mainRegion : regions[0];
}

/** The user's matched friends, highest rated first, each with a player only when the user may open their profile. */
export async function listFriends(game: CanonicalGameId, userId: string): Promise<FriendEntry[]> {
  const matched = await findFriends(game, userId);
  const rows = await readFriendRows(game, [...matched.keys()]);
  const friends = await Promise.all(rows.map(async (row): Promise<FriendEntry> => {
    const regions = matched.get(row.userId) ?? [];
    const visible = mayOpen(row);
    const region = shownRegion(row, regions);
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
  return friends.sort((a, b) => (b.player?.rating ?? -1) - (a.player?.rating ?? -1) || a.name.localeCompare(b.name));
}

export async function friendsOverview(game: CanonicalGameId, userId: string): Promise<FriendsOverview> {
  const [[viewer], identities, friends, hidden] = await Promise.all([
    db.select({ enabled: user.friendsEnabled }).from(user).where(eq(user.id, userId)).limit(1),
    db.select({ region: playerIdentities.region, syncedAt: playerIdentities.friendsSyncedAt })
      .from(playerIdentities)
      .where(and(eq(playerIdentities.userId, userId), eq(playerIdentities.game, game))),
    listFriends(game, userId),
    db.select({ userId: user.id, username: user.username, name: user.name, image: user.image })
      .from(friendHides)
      .innerJoin(user, eq(user.id, friendHides.hiddenUserId))
      .where(eq(friendHides.userId, userId))
      .orderBy(desc(friendHides.createdAt)),
  ]);

  return {
    enabled: viewer?.enabled ?? false,
    synced: identities.flatMap(({ region, syncedAt }) => syncedAt ? [{ region, syncedAt }] : []),
    friends,
    hidden,
  };
}

export type FriendSongScores = {
  username: string;
  name: string;
  image: string | null;
  region: Region;
  displayName: string;
  iconUrl: string;
  /** Best score on each of the song's charts the friend has played, by difficulty. */
  scores: Record<string, UserScore>;
};

/**
 * Friends' best scores on one song, in each region the viewer is their friend in. A friend is included only when
 * the viewer may open their profile and they share every score; statuses are cleared unless they share score details.
 */
export async function friendSongScores(game: CanonicalGameId, userId: string, song: Omit<SongQuery, "game">): Promise<FriendSongScores[]> {
  const matched = await findFriends(game, userId);
  const rows = (await readFriendRows(game, [...matched.keys()]))
    .filter(row => mayOpen(row) && privacyFor(row.audiences, "friend").profileShowAllScores);
  if (rows.length === 0) return [];

  const scores = await querySongScoresOf({ ...song, game, userIds: rows.map(row => row.userId) });
  const byUser = new Map(rows.map(row => [row.userId, row]));
  const entries = new Map<string, FriendSongScores>();
  for (const score of scores) {
    const row = byUser.get(score.userId);
    if (!row || !mayOpen(row) || !matched.get(score.userId)?.includes(score.region)) continue;
    const key = `${score.userId}:${score.region}`;
    const entry = entries.get(key) ?? {
      username: row.username,
      name: row.name,
      image: row.image,
      region: score.region,
      displayName: score.displayName,
      iconUrl: score.iconUrl,
      scores: {},
    };
    entry.scores[score.difficulty] = privacyFor(row.audiences, "friend").profileShowScoreDetails
      ? { scoreValue: score.scoreValue, comboStatus: score.comboStatus, syncStatus: score.syncStatus, clearStatus: score.clearStatus }
      : { scoreValue: score.scoreValue, comboStatus: 0, syncStatus: 0, clearStatus: 0 };
    entries.set(key, entry);
  }
  return [...entries.values()];
}
