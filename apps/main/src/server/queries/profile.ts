import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { getCurrentGame } from "@/lib/games/current";
import { isGameCnExclusive } from "@/lib/games/frontend";
import type { Region } from "@/lib/types";

export async function fetchProfileSettings(userId: string) {
  const result = await db
    .select({
      publishProfile: user.publishProfile,
      profileDescription: user.profileDescription,
      profileMainRegion: user.profileMainRegion,
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

  if (result.length === 0) return null;
  return result[0];
}

export async function fetchUserData(userId: string) {
  const cnOnly = isGameCnExclusive(getCurrentGame());
  const result = await db
    .select({
      username: user.username,
      publishProfile: user.publishProfile,
      role: user.role,
      ...(!cnOnly ? { region: user.region } : {}),
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (result.length === 0) return null;

  return {
    username: result[0].username,
    publishProfile: result[0].publishProfile,
    region: (!cnOnly ? result[0].region! : "cn") as Region,
    role: result[0].role,
  };
}
