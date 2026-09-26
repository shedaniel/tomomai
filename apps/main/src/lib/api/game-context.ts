import { gameIdSchema } from "@/lib/games/schema";
import { regionSchema } from "./schemas";
import type { NextRequest } from "next/server";
import { GameAdapterError, type CanonicalGameId, type GameCapability } from "@/lib/games/types";
import { requireCapability, resolveGameContext } from "@/lib/games/registry";
import type { RouteContext } from "./protect";

export function gameErrorResponse(error: unknown): Response {
  if (!(error instanceof GameAdapterError)) throw error;
  return Response.json({ error: error.message, code: error.code }, {
    status: error.code === "UNKNOWN_GAME" || error.code === "UNSUPPORTED_REGION" ? 400 : 422,
  });
}

export async function resolveApiGame(req: NextRequest, context: RouteContext, capability: GameCapability): Promise<CanonicalGameId | Response> {
  const params = await context.params;
  try {
    const parsed = gameIdSchema.safeParse(params.game);
    if (!parsed.success) throw new GameAdapterError("UNKNOWN_GAME", "A canonical game path is required");
    const game = parsed.data;
    const region = req.nextUrl.searchParams.get("region");
    if (region !== null) {
      const parsedRegion = regionSchema.safeParse(region);
      if (!parsedRegion.success) throw new GameAdapterError("UNSUPPORTED_REGION", "Invalid region", game);
      resolveGameContext(game, parsedRegion.data, capability);
    } else {
      requireCapability(game, capability);
    }
    return game;
  } catch (error) {
    return gameErrorResponse(error);
  }
}
