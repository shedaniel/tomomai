import { resolveApiGame } from "@/lib/api/game-context";
import type { RouteContext } from "@/lib/api/protect";
import type { NextRequest } from "next/server";
import { parseQuery } from "@/lib/api/parse-query";
import { catalogUrl, songCatalogKey, isCatalogVersion } from "@/lib/api/catalog-location";
import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";
import { spec } from "./spec";

export async function GET(req: NextRequest, context: RouteContext) {
  const game = await resolveApiGame(req, context, "catalog");
  if (game instanceof Response) return game;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  if (!isCatalogVersion(game, parsed.region, parsed.gameVersion)) return Response.json({ error: "Unknown game version for this region" }, { status: 400 });
  return new Response(null, {
    status: 302,
    headers: {
      ...SONG_CATALOG_CACHE_HEADERS,
      Location: catalogUrl(songCatalogKey(game, parsed.region, parsed.gameVersion)),
    },
  });
}
