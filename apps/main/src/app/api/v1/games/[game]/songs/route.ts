import { catalogUrl, songCatalogKey, isCatalogVersion } from "@/lib/api/catalog-location";
import { INVALID_PARAMETER } from "@/lib/api/parse-input";
import { definePublicGameHandler, redirectTo } from "@/lib/api/route";
import { spec } from "./spec";

export const GET = definePublicGameHandler(spec, async ({ game, query: { region, gameVersion } }) => {
  if (!isCatalogVersion(game, region, gameVersion)) {
    return Response.json({ error: "Unknown game version for this region", code: INVALID_PARAMETER }, { status: 400 });
  }
  return redirectTo(catalogUrl(songCatalogKey(game, region, gameVersion)));
});
