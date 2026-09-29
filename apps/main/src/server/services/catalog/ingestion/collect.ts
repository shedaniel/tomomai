import { resolveGameContext } from "@/lib/games/access";
import type { CanonicalGameId } from "@/lib/games/types";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export async function collectGameCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<CatalogChart[]> {
  resolveGameContext(game, { region: context.region, capability: "catalog", regionPolicy: "supported" });
  return GAME_SERVER_MODULES[game].catalog.collect(context);
}
