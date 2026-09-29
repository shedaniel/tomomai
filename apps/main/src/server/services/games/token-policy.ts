import "server-only";
import { getGame } from "@/lib/games/registry";
import { isSegaToken, parseToken, TOKEN_PROVIDERS, type ParsedToken, type SegaToken } from "@/lib/games/token-format";
import type { CanonicalGameId } from "@/lib/games/types";
import { getLogger } from "@/lib/request-logger";
import type { Region } from "@/lib/types";
import { deleteToken } from "./tokens";

const UNSUPPORTED_HERE = "Invalid token format. This kind of token is not supported in this region.";

/** Deletes the player's stored token, which can never sign in, and fails with the reason. Without a user nothing is deleted. */
export async function refuseToken(game: CanonicalGameId, userId: string | null, region: Region, reason: string): Promise<never> {
  getLogger().warn({ game, region, userId }, "Refused a token that cannot sign in");
  if (userId) await deleteToken(game, userId, region);
  throw new Error(reason);
}

/** Reads a token for one of the region's login methods, refusing any other. */
export async function acceptToken(game: CanonicalGameId, userId: string | null, region: Region, token: string): Promise<ParsedToken> {
  const parsed = parseToken(token);
  if (parsed.provider === null) return refuseToken(game, userId, region, parsed.error);
  if (!getGame(game).loginMethods[region]?.includes(TOKEN_PROVIDERS[parsed.provider].loginMethod)) {
    return refuseToken(game, userId, region, UNSUPPORTED_HERE);
  }
  return parsed;
}

/** Reads a token that signs in with SEGA in the region. */
export async function acceptSegaToken(game: CanonicalGameId, userId: string | null, region: Region, token: string): Promise<SegaToken> {
  const accepted = await acceptToken(game, userId, region, token);
  return isSegaToken(accepted) ? accepted : refuseToken(game, userId, region, UNSUPPORTED_HERE);
}
