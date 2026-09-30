import type { CanonicalGameId, GameCapability } from "@/lib/games/types";
import { resolveGameContext } from "@/lib/games/access";
import { PUBLIC_VIEWS, type PublicView } from "@/lib/games/public-player";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";

const privacyColumns = {
  profileShowAllScores: user.profileShowAllScores,
  profileShowScoreDetails: user.profileShowScoreDetails,
  profileShowPlates: user.profileShowPlates,
  profileShowPlayCounts: user.profileShowPlayCounts,
  profileShowEvents: user.profileShowEvents,
};

export async function resolvePublicUserByUsername(game: CanonicalGameId, username: string) {
  const reserved = await GAME_SERVER_MODULES[game].reserved?.user(username);
  if (reserved) return reserved;

  const userRecord = await db
    .select({
      id: user.id,
      name: user.name,
      publishProfile: user.publishProfile,
      profileDescription: user.profileDescription,
      profileMainRegion: user.profileMainRegion,
      ...privacyColumns,
      profileShowInSearch: user.profileShowInSearch,
    })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);

  if (userRecord.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  const userData = userRecord[0];

  if (!userData.publishProfile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not published",
    });
  }

  if (!userData.profileShowInSearch) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Profile not accessible",
    });
  }

  return userData;
}

/**
 * A snapshot a visitor may open `view` of: its owner publishes a listed profile, like
 * resolvePublicUserByUsername requires, and shares that view, and the game offers `capability`
 * in the snapshot's region. A hidden view is NOT_FOUND, like a missing snapshot. Callers read
 * the snapshot's own region, never one they are sent.
 */
export async function resolvePublicSnapshotAccess(
  game: CanonicalGameId,
  snapshotPublicId: string,
  { capability, view }: { capability: GameCapability; view: PublicView },
) {
  resolveGameContext(game, { capability });
  const [snapshot] = await db
    .select({
      userId: userSnapshots.userId,
      snapshotInternalId: userSnapshots.id,
      gameVersion: userSnapshots.gameVersion,
      region: userSnapshots.region,
      privacy: privacyColumns,
    })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(and(
      eq(userSnapshots.game, game),
      eq(userSnapshots.publicId, snapshotPublicId),
      eq(user.publishProfile, true),
      eq(user.profileShowInSearch, true),
    ))
    .limit(1);

  if (!snapshot || !PUBLIC_VIEWS[view](snapshot.privacy)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Snapshot not found or not public",
    });
  }

  resolveGameContext(game, { region: snapshot.region, capability });
  return snapshot;
}
