import { locales } from "@tomomai/i18n/locale";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getEnabledRegions } from "@/lib/games/regions";
import { getCurrentGame } from "@/lib/games/current";
import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import type { Region } from "@/lib/types";

export function revalidatePublicProfile(
  game: CanonicalGameId,
  usernames: Array<string | null | undefined>,
  regions: readonly Region[] = getEnabledRegions(game),
) {
  if (game !== getCurrentGame().id) return;
  const uniqueUsernames = new Set(usernames.filter((username): username is string => Boolean(username)));
  for (const username of uniqueUsernames) {
    const encodedUsername = encodeURIComponent(username);
    for (const locale of locales) {
      for (const region of regions) {
        revalidatePath(`/${locale}/profile/${encodedUsername}/${region}`, "page");
      }
    }
  }
}

export async function revalidatePublicProfileForUser(game: CanonicalGameId, userId: string, regions?: readonly Region[]) {
  const [record] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (record?.username) revalidatePublicProfile(game, [record.username], regions);
}

export function revalidateCurrentSitePublicProfile(usernames: Array<string | null | undefined>, regions?: readonly Region[]) {
  return revalidatePublicProfile(getCurrentGame().id, usernames, regions);
}

export function revalidateCurrentSitePublicProfileForUser(userId: string, regions?: readonly Region[]) {
  return revalidatePublicProfileForUser(getCurrentGame().id, userId, regions);
}
