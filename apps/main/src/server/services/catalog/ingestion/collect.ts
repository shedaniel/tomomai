import type { CanonicalGameId } from "@/lib/games/types";
import { resolveCatalogContext, requireConfiguredSource } from "@/server/services/games/registry";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export async function collectGameCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<CatalogChart[]> {
  resolveCatalogContext(game, context.region);
  const collect = requireConfiguredSource(game, "catalog").collect;
  return collect(context);
}
