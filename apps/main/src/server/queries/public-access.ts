import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";

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
      profileShowAllScores: user.profileShowAllScores,
      profileShowScoreDetails: user.profileShowScoreDetails,
      profileShowPlates: user.profileShowPlates,
      profileShowPlayCounts: user.profileShowPlayCounts,
      profileShowEvents: user.profileShowEvents,
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

export async function resolvePublicSnapshotUserId(game: CanonicalGameId, snapshotPublicId: string) {
  const snapshotRecord = await db
    .select({
      userId: userSnapshots.userId,
      snapshotInternalId: userSnapshots.id,
      gameVersion: userSnapshots.gameVersion,
    })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(
      and(
        eq(userSnapshots.game, game),
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(user.publishProfile, true)
      )
    )
    .limit(1);

  if (snapshotRecord.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Snapshot not found or not public",
    });
  }

  return snapshotRecord[0];
}

