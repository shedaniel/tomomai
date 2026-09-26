import { requireConfiguredSource } from "@/server/services/games/adapters";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export function catalogRequiresToken(game: CanonicalGameId, region: Region): boolean {
  return requireConfiguredSource(game, "catalog").requiresToken?.(region) ?? false;
}

export async function authenticateCatalogSource(game: CanonicalGameId, region: Region, token: string | null): Promise<string> {
  if (!catalogRequiresToken(game, region)) return "";
  if (!token) throw new Error("Missing 'token' query parameter");
  const authenticate = requireConfiguredSource(game, "catalog").authenticate;
  if (!authenticate) throw new Error("Catalog authentication is not configured");
  return authenticate(region, token);
}
