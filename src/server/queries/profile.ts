import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { isChinaRegion } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

export async function fetchUserData(userId: string) {
  const result = await db
    .select({
      username: user.username,
      publishProfile: user.publishProfile,
      role: user.role,
      ...(!isChinaRegion() ? { region: user.region } : {}),
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (result.length === 0) return null;

  return {
    username: result[0].username,
    publishProfile: result[0].publishProfile,
    region: (!isChinaRegion() ? result[0].region! : "cn") as Region,
    role: result[0].role,
  };
}
