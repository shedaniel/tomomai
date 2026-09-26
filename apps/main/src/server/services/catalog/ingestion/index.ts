import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { resolveCatalogContext, resolveGame } from "@/lib/games/registry";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import type { Region } from "@/lib/types";
import type { Logger } from "pino";

export async function collectCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<CatalogChart[]> {
  resolveCatalogContext(game, context.region);
  const collect = resolveGame(game).adapter.catalog.collect;
  if (!collect) throw new GameAdapterError("SOURCE_NOT_CONFIGURED", "Catalog collection is not configured", game, context.region);
  return collect(context);
}

export async function ingestCatalog(input: {
  game: CanonicalGameId;
  region: Region;
  version: number;
  uploadSongs: CatalogChart[];
  updateMode: "noop" | "alter" | "destructive";
  log: Logger;
}) {
  resolveCatalogContext(input.game, input.region);
  // Collection must not initialize the database; load persistence only for an ingest request.
  const { persistCatalog } = await import("@/server/services/catalog/ingestion/persistence");
  return persistCatalog(input.game, input.region, input.version, input.uploadSongs, input.updateMode, input.log);
}
