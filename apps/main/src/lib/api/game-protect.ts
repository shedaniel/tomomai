import type { NextRequest } from "next/server";
import type { CanonicalGameId, GameCapability } from "@/lib/games/types";
import { withApiKey, type ApiKeyInfo, type RouteContext } from "./protect";
import type { ScopeKey } from "./scopes";
import { resolveApiGame } from "./game-context";
export { keyHasScope } from "./protect";

export function withGameApiKey(
  scopes: ScopeKey[],
  handler: (req: NextRequest, key: ApiKeyInfo & { game: CanonicalGameId }, context: RouteContext) => Promise<Response>,
) {
  const family = scopes[0]?.split(":")[0];
  const capability: GameCapability = family === "album" ? "albums" : family === "recent" ? "recents" : family === "plate" ? "plates" : "scores";
  return async (req: NextRequest, context: RouteContext) => {
    const game = await resolveApiGame(req, context, capability);
    if (game instanceof Response) return game;
    return withApiKey(scopes, (request, key, ctx) => handler(request, { ...key, game }, ctx))(req, context);
  };
}
