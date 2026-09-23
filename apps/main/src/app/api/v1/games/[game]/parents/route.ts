import { resolveApiGame } from "@/lib/api/game-context";
import type { RouteContext } from "@/lib/api/protect";
import type { NextRequest } from "next/server";
import { catalogUrl, catalogPrefix } from "@/lib/api/catalog-location";
import { SONG_CATALOG_CACHE_HEADERS } from "../songs/cache-headers";

export async function GET(req: NextRequest, context: RouteContext) {
  const game = await resolveApiGame(req, context, "catalog");
  if (game instanceof Response) return game;
  return new Response(null, {
    status: 302,
    headers: {
      ...SONG_CATALOG_CACHE_HEADERS,
      Location: catalogUrl(`${catalogPrefix(game)}/parents`),
    },
  });
}
