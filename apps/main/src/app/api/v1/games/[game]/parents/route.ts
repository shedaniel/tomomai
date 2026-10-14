import { catalogUrl, parentCatalogKey } from "@/lib/api/catalog-location";
import { definePublicGameHandler, redirectTo } from "@/lib/api/route";
import { spec } from "./spec";

export const GET = definePublicGameHandler(spec, async ({ game }) => redirectTo(catalogUrl(parentCatalogKey(game))));
