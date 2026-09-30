import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import type { CanonicalGameId } from "@/lib/games/types";
import { gamePreference } from "./game-preferences";

/** The profile main region is the one chosen for `game`. The other settings are account-wide. */
export async function fetchProfileSettings(game: CanonicalGameId, userId: string) {
  const [settings] = await db
    .select({
      publishProfile: user.publishProfile,
      profileDescription: user.profileDescription,
      profileMainRegion: gamePreference(game, "profileMainRegion"),
      profileShowAllScores: user.profileShowAllScores,
      profileShowScoreDetails: user.profileShowScoreDetails,
      profileShowPlates: user.profileShowPlates,
      profileShowPlayCounts: user.profileShowPlayCounts,
      profileShowEvents: user.profileShowEvents,
      profileShowInSearch: user.profileShowInSearch,
      fetchUseAlbums: user.fetchUseAlbums,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return settings ?? null;
}

/** The account with its dashboard region preference for `game`, null when none is set. */
export async function fetchUserData(game: CanonicalGameId, userId: string) {
  const [userData] = await db
    .select({
      username: user.username,
      email: user.email,
      publishProfile: user.publishProfile,
      role: user.role,
      region: gamePreference(game, "region"),
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return userData ?? null;
}
