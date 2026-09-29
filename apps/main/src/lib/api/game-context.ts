import { gameIdSchema } from "@/lib/games/schema";
import { regionSchema } from "./schemas";
import type { NextRequest } from "next/server";
import { resolveGameContext } from "@/lib/games/access";
import { GameAdapterError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId, GameCapability } from "@/lib/games/types";
import type { RouteContext } from "./protect";

export async function resolveApiGame(req: NextRequest, context: RouteContext, capability: GameCapability): Promise<CanonicalGameId | Response> {
  const params = await context.params;
  const game = gameIdSchema.safeParse(params.game);
  if (!game.success) return gameErrorResponse(new GameAdapterError("UNKNOWN_GAME", "A canonical game path is required"));
  const region = req.nextUrl.searchParams.get("region");
  const parsedRegion = region === null ? undefined : regionSchema.safeParse(region);
  if (parsedRegion && !parsedRegion.success) {
    return gameErrorResponse(new GameAdapterError("UNSUPPORTED_REGION", "Invalid region", game.data));
  }
  try {
    resolveGameContext(game.data, { region: parsedRegion?.data, capability });
    return game.data;
  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    throw error;
  }
}
