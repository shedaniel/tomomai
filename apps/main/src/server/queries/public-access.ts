import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getReservedPublicUser } from "./reserved";

export async function resolvePublicUserByUsername(username: string) {
  const reserved = getReservedPublicUser(username);
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

/** `requireScoreDetails` gates play history (recents, credits, daily plays) behind the owner's score-details setting. */
export async function resolvePublicSnapshotUserId(snapshotPublicId: string, opts?: { requireScoreDetails?: boolean }) {
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
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(user.publishProfile, true),
        opts?.requireScoreDetails ? eq(user.profileShowScoreDetails, true) : undefined,
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

/**
 * Owner of a snapshot whose play history the viewer may render: the owner
 * themselves, or anyone when the profile is public with score details shown.
 */
export async function resolvePlayHistoryOwner(snapshotPublicId: string, viewerId: string | undefined): Promise<string | null> {
  const [row] = await db
    .select({
      userId: userSnapshots.userId,
      publishProfile: user.publishProfile,
      showScoreDetails: user.profileShowScoreDetails,
    })
    .from(userSnapshots)
    .innerJoin(user, eq(userSnapshots.userId, user.id))
    .where(eq(userSnapshots.publicId, snapshotPublicId))
    .limit(1);
  if (!row) return null;
  if (row.userId === viewerId || (row.publishProfile && row.showScoreDetails)) return row.userId;
  return null;
}
