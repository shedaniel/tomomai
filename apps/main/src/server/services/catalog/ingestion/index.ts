import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { resolveCatalogContext, resolveGame } from "@/lib/games/registry";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export async function collectCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<CatalogChart[]> {
  resolveCatalogContext(game, context.region);
  const collect = resolveGame(game).adapter.catalog.collect;
  if (!collect) throw new GameAdapterError("SOURCE_NOT_CONFIGURED", "Catalog collection is not configured", game, context.region);
  return collect(context);
}
