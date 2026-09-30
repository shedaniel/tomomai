import { toFrontendGame, type FrontendGame } from "@/lib/games/frontend";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getSupportedRegions } from "@/lib/games/regions";
import { getGame } from "@/lib/games/registry";

/**
 * The served game as getCurrentGame describes it, from the real definition. Only the enabled regions can be
 * chosen (every supported region by default), so a test cannot give a game capabilities it does not have.
 */
export function testGame(id: CanonicalGameId, regions: readonly Region[] = getSupportedRegions(id)): FrontendGame {
  return toFrontendGame(getGame(id), regions);
}
