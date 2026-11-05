import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { ProfileSettings } from "@/lib/types";
import { gamePreference } from "./game-preferences";
import { profileAudienceColumns } from "./public-access";

/** The profile main region is the one chosen for `game`. The other settings are account-wide. */
export async function fetchProfileSettings(game: CanonicalGameId, userId: string): Promise<ProfileSettings | null> {
  const [settings] = await db
    .select({
      ...profileAudienceColumns,
      profileDescription: user.profileDescription,
      profileMainRegion: gamePreference(game, "profileMainRegion"),
      friendsEnabled: user.friendsEnabled,
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
      image: user.image,
      profileVisibility: user.profileVisibility,
      role: user.role,
      region: gamePreference(game, "region"),
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return userData ?? null;
}
