import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { resolveCatalogContext, resolveGame } from "@/lib/games/registry";
import type { CatalogFetchContext, PendingChart } from "@/lib/games/catalog-types";
import type { Region } from "@/lib/types";
import type { Logger } from "pino";

export async function collectCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<PendingChart[]> {
  resolveCatalogContext(game, context.region);
  const collect = resolveGame(game).adapter.catalog.collect;
  if (!collect) throw new GameAdapterError("SOURCE_NOT_CONFIGURED", "Catalog collection is not configured", game, context.region);
  return collect(context);
}

export async function ingestCatalog(input: {
  game: CanonicalGameId;
  region: Region;
  version: number;
  uploadSongs: PendingChart[];
  updateMode: "noop" | "alter" | "destructive";
  log: Logger;
}) {
  resolveCatalogContext(input.game, input.region);
  const { persistCatalog } = await import("./catalog-persistence");
  return persistCatalog(input.game, input.region, input.version, input.uploadSongs, input.updateMode, input.log);
}
