import { catalogUrl, CATALOG_R2_PREFIX } from "@/lib/api/catalog-location";
import { SONG_CATALOG_CACHE_HEADERS } from "../songs/cache-headers";

export function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      ...SONG_CATALOG_CACHE_HEADERS,
      Location: catalogUrl(`${CATALOG_R2_PREFIX}/parents`),
    },
  });
}
