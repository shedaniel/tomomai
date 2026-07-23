import { locales } from "@tomomai/i18n/locale";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getEnabledRegions } from "@/lib/enabled-regions";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import type { Region } from "@/lib/types";

export function revalidatePublicProfile(
  usernames: Array<string | null | undefined>,
  regions: readonly Region[] = getEnabledRegions(),
) {
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

export async function revalidatePublicProfileForUser(userId: string, regions?: readonly Region[]) {
  const [record] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (record?.username) revalidatePublicProfile([record.username], regions);
}
