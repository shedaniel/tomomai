import type { NextRequest } from "next/server";
import { GameAdapterError, type CanonicalGameId, type GameCapability } from "@/lib/games/types";
import { requireCapability, resolveGame, resolveGameContext } from "@/lib/games/registry";
import type { RouteContext } from "./protect";

export function gameErrorResponse(error: unknown): Response {
  if (!(error instanceof GameAdapterError)) throw error;
  return Response.json({ error: error.message, code: error.code }, {
    status: error.code === "UNKNOWN_GAME" || error.code === "UNSUPPORTED_REGION" ? 400 : 422,
  });
}

export async function resolveApiGame(req: NextRequest, context: RouteContext, capability: GameCapability): Promise<CanonicalGameId | Response> {
  const { game } = await context.params;
  try {
    if (game !== "maimai" && game !== "chunithm") throw new GameAdapterError("UNKNOWN_GAME", "A canonical game path is required");
    const registration = resolveGame(game);
    if (!registration.enabled) throw new GameAdapterError("GAME_NOT_ENABLED", `${registration.displayName} is not enabled`, game);
    requireCapability(game, capability);
    const region = req.nextUrl.searchParams.get("region");
    if (region !== null) {
      if (region !== "jp" && region !== "intl" && region !== "cn") throw new GameAdapterError("UNSUPPORTED_REGION", "Invalid region", game);
      resolveGameContext(game, region, capability);
    }
    return game;
  } catch (error) {
    return gameErrorResponse(error);
  }
}

