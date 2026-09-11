import type { NextRequest } from "next/server";
import { parseQuery } from "@/lib/api/parse-query";
import { catalogUrl, songCatalogKey } from "@/lib/api/catalog-location";
import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";
import { spec } from "./spec";

export function GET(req: NextRequest) {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  return new Response(null, {
    status: 302,
    headers: {
      ...SONG_CATALOG_CACHE_HEADERS,
      Location: catalogUrl(songCatalogKey(parsed.region, parsed.gameVersion)),
    },
  });
}
