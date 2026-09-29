import "server-only";
import { z } from "zod";
import { sign, verify } from "@/lib/signed-token";

const TTL_SECONDS = 15 * 60;

const cnProxyTokenSchema = z.strictObject({ userId: z.string().min(1), exp: z.number() });

function getSecret(): string {
  const secret = process.env.CN_PROXY_TOKEN_SECRET;
  if (!secret) throw new Error("CN_PROXY_TOKEN_SECRET must be set to sign cn-proxy tokens.");
  return secret;
}

/** Binds a user to one WeChat OAuth handoff. The CN proxy hands it back to the webhook unchanged. */
export function signCnProxyToken(userId: string): string {
  return sign({ userId }, { secret: getSecret(), ttlSeconds: TTL_SECONDS });
}

export function verifyCnProxyToken(token: string): { userId: string } | null {
  const claims = verify(token, cnProxyTokenSchema, { secret: getSecret() });
  return claims && { userId: claims.userId };
}
