import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userTokens } from "@/lib/db/schema-pg";
import type { CanonicalGameId } from "@/lib/games/types";
import { getLogger } from "@/lib/request-logger";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import type { Region } from "@/lib/types";

function tokenScope(game: CanonicalGameId, userId: string, region: Region) {
  return and(eq(userTokens.userId, userId), eq(userTokens.game, game), eq(userTokens.region, region));
}

export async function readToken(game: CanonicalGameId, userId: string, region: Region): Promise<string | null> {
  const [record] = await db.select({ token: userTokens.token }).from(userTokens)
    .where(tokenScope(game, userId, region)).limit(1);
  if (!record) return null;
  try {
    return decryptToken(record.token);
  } catch (err) {
    getLogger().error({ err, game, region }, "Failed to decrypt token");
    throw new Error("Failed to decrypt stored token. Please re-add your authentication tokens.", { cause: err });
  }
}

export async function saveToken(game: CanonicalGameId, userId: string, region: Region, token: string): Promise<void> {
  const encrypted = encryptToken(token);
  const now = new Date();
  await db.insert(userTokens).values({ game, userId, region, token: encrypted, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [userTokens.userId, userTokens.game, userTokens.region],
      set: { token: encrypted, updatedAt: now },
    });
}

export async function updateToken(game: CanonicalGameId, userId: string, region: Region, token: string): Promise<void> {
  await db.update(userTokens).set({ token: encryptToken(token), updatedAt: new Date() })
    .where(tokenScope(game, userId, region));
}

export async function deleteToken(game: CanonicalGameId, userId: string, region: Region): Promise<void> {
  await db.delete(userTokens).where(tokenScope(game, userId, region));
}
