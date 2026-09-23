import { resolveApiGame } from "@/lib/api/game-context";
import type { RouteContext } from "@/lib/api/protect";
import type { NextRequest } from "next/server";
import { getAvailableVersions, getCurrentVersion } from "@/lib/games/versions";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { SONG_CATALOG_CACHE_HEADERS } from "../cache-headers";
import { spec } from "./spec";

export async function GET(req: NextRequest, context: RouteContext) {
  const game = await resolveApiGame(req, context, "catalog");
  if (game instanceof Response) return game;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  return zodJson(spec.response, {
    game,
    currentVersion: getCurrentVersion(game, parsed.region),
    versions: getAvailableVersions(game, parsed.region).map(({ id, name }) => ({ id, name })),
  }, { headers: SONG_CATALOG_CACHE_HEADERS });
}
