import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export function catalogRequiresToken(game: CanonicalGameId, region: Region): boolean {
  return GAME_SERVER_MODULES[game].catalog.requiresToken?.(region) ?? false;
}

export async function authenticateCatalogSource(game: CanonicalGameId, region: Region, token: string | null): Promise<string> {
  if (!catalogRequiresToken(game, region)) return "";
  if (!token) throw new Error("Missing 'token' query parameter");
  const authenticate = GAME_SERVER_MODULES[game].catalog.authenticate;
  if (!authenticate) throw new Error("Catalog authentication is not configured");
  return authenticate(region, token);
}
