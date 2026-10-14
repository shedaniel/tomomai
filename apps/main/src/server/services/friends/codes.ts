import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import type { CanonicalGameId } from "@/lib/games/ids";

let key: Buffer | undefined;

function friendCodeKey(): Buffer {
  if (key) return key;
  const secret = process.env.TOKEN_SECRET;
  if (!secret) throw new Error("TOKEN_SECRET must be set to hash friend codes");
  key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "tomomai friend codes", 32));
  return key;
}

/**
 * A friend code as it is stored and compared. Friend lists mostly name players who never joined, so
 * no code is kept in the clear. Rotating TOKEN_SECRET unmatches everyone until their next sync.
 */
export function hashFriendCode(game: CanonicalGameId, code: string): string {
  return createHmac("sha256", friendCodeKey()).update(`${game}:${code.replace(/\s+/g, "")}`).digest("hex");
}
