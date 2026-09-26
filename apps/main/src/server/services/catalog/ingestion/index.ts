import type { CanonicalGameId } from "@/lib/games/types";
import { resolveCatalogContext, requireConfiguredSource } from "@/server/services/games/adapters";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export async function collectCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<CatalogChart[]> {
  resolveCatalogContext(game, context.region);
  const collect = requireConfiguredSource(game, "catalog").collect;
  return collect(context);
}
