import { parseCatalogVersion } from "@/lib/catalog/parse-version";
import { getCurrentGame } from "@/lib/games/current";
import { GameError } from "@/lib/games/errors";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getEnabledRegions, getSupportedRegions } from "@/lib/games/regions";
import { gameIdSchema } from "@/lib/games/schema";

/** A malformed admin request. `adminRoute` answers it with a 400 and its message. */
export class AdminRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdminRequestError";
  }
}

/**
 * Reads the explicit `game` of an admin request. A write must run on the game's own site, the only
 * deployment that renders its pages, so its page cache is invalidated where it lives.
 */
export function resolveAdminGame(params: URLSearchParams, { write }: { write: boolean }): CanonicalGameId {
  const parsed = gameIdSchema.safeParse(params.get("game"));
  if (!parsed.success) throw new GameError("UNKNOWN_GAME", "Canonical game parameter is required");
  const site = getCurrentGame().id;
  if (write && parsed.data !== site) {
    throw new GameError("WRONG_SITE", `The ${parsed.data} catalog is written on the ${parsed.data} site. This site serves ${site}.`, parsed.data);
  }
  return parsed.data;
}

export function requireAdminRegion(game: CanonicalGameId, params: URLSearchParams): Region {
  const region = params.get("region");
  const regions = getSupportedRegions(game);
  if (!region || !regions.includes(region as Region)) {
    throw new AdminRequestError(`Missing or invalid 'region' query parameter. Must be one of: ${regions.join(", ")}`);
  }
  return region as Region;
}

export function requireAdminCatalogVersion(game: CanonicalGameId, region: Region, input: string): number {
  try {
    return parseCatalogVersion(game, region, input);
  } catch (error) {
    throw new AdminRequestError(`Invalid catalog version for ${region}: ${input}`, { cause: error });
  }
}

export function getDefaultAdminCatalogRegions(game: CanonicalGameId): Region[] {
  const enabled = getEnabledRegions(game);
  return enabled.length ? enabled : getSupportedRegions(game);
}
