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
import { gamePreference } from "./game-preferences";

const privacyColumns = {
  profileShowAllScores: user.profileShowAllScores,
  profileShowScoreDetails: user.profileShowScoreDetails,
  profileShowPlates: user.profileShowPlates,
  profileShowPlayCounts: user.profileShowPlayCounts,
  profileShowEvents: user.profileShowEvents,
};

/** How a visitor reaches a profile: it is published and listed, or its owner shares it with them as an in-game friend. */
export type ProfileAccess = "public" | "friend";

type OwnerVisibility = { id: string; publishProfile: boolean; profileShowInSearch: boolean; profileShareWithFriends: boolean };

async function profileAccess(game: CanonicalGameId, owner: OwnerVisibility, viewerId: string | undefined): Promise<ProfileAccess | null> {
  if (owner.publishProfile && owner.profileShowInSearch) return "public";
  if (viewerId && owner.profileShareWithFriends && await areFriends(game, viewerId, owner.id)) return "friend";
  return null;
}

/** The profile a visitor may open. Signed-in visitors pass their id, so a profile shared with friends opens for its owner's friends. */
export async function resolvePublicUserByUsername(game: CanonicalGameId, username: string, viewerId?: string) {
  const reserved = await GAME_SERVER_MODULES[game].reserved?.user(username);
  if (reserved) return { ...reserved, access: "public" as ProfileAccess };

  const [userData] = await db
    .select({
      id: user.id,
      name: user.name,
      publishProfile: user.publishProfile,
      profileDescription: user.profileDescription,
      profileMainRegion: gamePreference(game, "profileMainRegion"),
      ...privacyColumns,
      profileShowInSearch: user.profileShowInSearch,
      profileShareWithFriends: user.profileShareWithFriends,
    })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);

  const access = userData ? await profileAccess(game, userData, viewerId) : null;
  if (!userData || !access) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not found or not shared",
    });
  }

  const { profileShareWithFriends: _, ...profile } = userData;
  return { ...profile, access };
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
      privacy: privacyColumns,
      owner: {
        id: user.id,
        publishProfile: user.publishProfile,
        profileShowInSearch: user.profileShowInSearch,
        profileShareWithFriends: user.profileShareWithFriends,
      },
    })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(and(
      eq(userSnapshots.game, game),
      eq(userSnapshots.publicId, snapshotPublicId),
    ))
    .limit(1);

  if (!snapshot || !PUBLIC_VIEWS[view](snapshot.privacy) || !await profileAccess(game, snapshot.owner, viewerId)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Snapshot not found or not public",
    });
  }

  resolveGameContext(game, { region: snapshot.region, capability });
  const { owner: _, ...access } = snapshot;
  return access;
}
