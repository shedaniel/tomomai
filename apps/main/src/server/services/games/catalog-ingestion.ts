import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { requireConfiguredSource, resolveGame, resolveGameContext } from "@/lib/games/registry";
import type { CatalogFetchContext } from "@/lib/games/catalog-types";
import type { UpdateSong } from "@/lib/types/update";
import type { Region } from "@/lib/types";
import type { VersionId } from "@/lib/metadata";
import type { Logger } from "pino";
import type { ingestMaimaiCatalog } from "../admin/maimai-catalog-ingestion";

export type CatalogImplementation = {
  collect: (context: CatalogFetchContext) => Promise<UpdateSong[]>;
  ingest: typeof ingestMaimaiCatalog;
};

async function implementation(game: CanonicalGameId, region: Region): Promise<CatalogImplementation> {
  resolveGameContext(game, region, "catalog");
  requireConfiguredSource(game, "catalog");
  const loader = resolveGame(game).adapter.catalog.loadImplementation;
  if (!loader) throw new GameAdapterError("SOURCE_NOT_CONFIGURED", "Catalog implementation is not configured", game, region);
  return await loader() as CatalogImplementation;
}

export async function collectCatalog(game: CanonicalGameId, context: CatalogFetchContext): Promise<UpdateSong[]> {
  const adapter = await implementation(game, context.region);
  return adapter.collect(context);
}

export async function ingestCatalog(input: {
  game: CanonicalGameId;
  region: Region;
  version: VersionId;
  uploadSongs: UpdateSong[];
  updateMode: "noop" | "alter" | "destructive";
  log: Logger;
}) {
  const adapter = await implementation(input.game, input.region);
  return adapter.ingest(input.game, input.region, input.version, input.uploadSongs, input.updateMode, input.log);
}
