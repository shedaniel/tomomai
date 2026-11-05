import type { GameCapability } from "@/lib/games/types";
import type { CanonicalGameId } from "@/lib/games/ids";
import { resolveGameContext } from "@/lib/games/access";
import { PUBLIC_VIEWS, type PublicView } from "@/lib/games/public-player";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { areFriends } from "@/server/services/friends/queries";
import { friendsSeeMore, privacyFor, profileViewer, type ProfileAudienceSettings } from "@/lib/profile-audience";
import type { ProfilePrivacySettings } from "@/lib/types";
import { gamePreference } from "./game-preferences";

/** A profile's stored audiences, for privacyFor. */
export const profileAudienceColumns = {
  profileVisibility: user.profileVisibility,
  profileAllScoresAudience: user.profileAllScoresAudience,
  profileScoreDetailsAudience: user.profileScoreDetailsAudience,
  profilePlatesAudience: user.profilePlatesAudience,
  profilePlayCountsAudience: user.profilePlayCountsAudience,
  profileEventsAudience: user.profileEventsAudience,
  profileShowInSearch: user.profileShowInSearch,
};

export const isPublicProfile = eq(user.profileVisibility, "public");

/** How a visitor reaches a profile: it is public, or its owner shares it with them as an in-game friend. */
export type ProfileAccess = "public" | "friend";

async function profileAccess(
  game: CanonicalGameId,
  ownerId: string,
  audiences: ProfileAudienceSettings,
  viewerId: string | undefined,
): Promise<{ access: ProfileAccess; privacy: ProfilePrivacySettings } | null> {
  const isFriend = !!viewerId && friendsSeeMore(audiences) && await areFriends(game, viewerId, ownerId);
  const viewer = profileViewer(audiences.profileVisibility, isFriend);
  if (!viewer) return null;
  return { access: audiences.profileVisibility === "public" ? "public" : "friend", privacy: privacyFor(audiences, viewer) };
}

/**
 * The profile a visitor may open, or NOT_FOUND, with what that visitor may see of it. Signed-in visitors pass
 * their id, so a friends-only profile opens for its owner's friends. An unlisted public profile is still served;
 * it is only kept out of the sitemap, search engines and in-site search.
 */
export async function resolvePublicUserByUsername(game: CanonicalGameId, username: string, viewerId?: string) {
  const reserved = await GAME_SERVER_MODULES[game].reserved?.user(username);
  if (reserved) return { ...reserved, access: "public" as ProfileAccess };

  const [userData] = await db
    .select({
      id: user.id,
      name: user.name,
      profileDescription: user.profileDescription,
      profileMainRegion: gamePreference(game, "profileMainRegion"),
      audiences: profileAudienceColumns,
    })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);

  const opened = userData ? await profileAccess(game, userData.id, userData.audiences, viewerId) : null;
  if (!userData || !opened) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not found or not shared",
    });
  }

  const { audiences: _, ...profile } = userData;
  return { ...profile, ...opened.privacy, access: opened.access };
}

/**
 * A snapshot a visitor may open `view` of: the visitor may open its owner's profile, like
 * resolvePublicUserByUsername requires, and the owner shares that view, and the game offers `capability`
 * in the snapshot's region. A hidden view is NOT_FOUND, like a missing snapshot. Callers read
 * the snapshot's own region, never one they are sent.
 */
export async function resolvePublicSnapshotAccess(
  game: CanonicalGameId,
  snapshotPublicId: string,
  { capability, view, viewerId }: { capability: GameCapability; view: PublicView; viewerId?: string },
) {
  resolveGameContext(game, { capability });
  const [snapshot] = await db
    .select({
      userId: userSnapshots.userId,
      snapshotInternalId: userSnapshots.id,
      gameVersion: userSnapshots.gameVersion,
      region: userSnapshots.region,
      audiences: profileAudienceColumns,
    })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(and(
      eq(userSnapshots.game, game),
      eq(userSnapshots.publicId, snapshotPublicId),
    ))
    .limit(1);

  const privacy = snapshot ? (await profileAccess(game, snapshot.userId, snapshot.audiences, viewerId))?.privacy : null;
  if (!snapshot || !privacy || !PUBLIC_VIEWS[view](privacy)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Snapshot not found or not public",
    });
  }

  resolveGameContext(game, { region: snapshot.region, capability });
  const { audiences: _, ...found } = snapshot;
  return { ...found, privacy };
}

/** The region of one of the user's own snapshots of the game, whether or not their profile is published. */
export async function resolveOwnSnapshotRegion(game: CanonicalGameId, snapshotPublicId: string, userId: string) {
  const [snapshot] = await db
    .select({ region: userSnapshots.region })
    .from(userSnapshots)
    .where(and(
      eq(userSnapshots.game, game),
      eq(userSnapshots.publicId, snapshotPublicId),
      eq(userSnapshots.userId, userId),
    ))
    .limit(1);
  return snapshot?.region ?? null;
}

/**
 * Owner of a snapshot whose play history the viewer may render: the owner
 * themselves, or anyone when the profile is public with score details shown.
 */
export async function resolvePlayHistoryOwner(snapshotPublicId: string, viewerId: string | undefined): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSnapshots.userId, audiences: profileAudienceColumns })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(eq(userSnapshots.publicId, snapshotPublicId))
    .limit(1);
  if (!row) return null;
  if (row.userId === viewerId || privacyFor(row.audiences, "public").profileShowScoreDetails) return row.userId;
  return null;
}
