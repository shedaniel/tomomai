import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import type { Logger } from "pino";
import { z } from "zod";
import { locales } from "@tomomai/i18n/locale";
import { catalogTags } from "@/lib/cache-tags";
import { keyOf } from "@/lib/games/codes";
import { getCurrentGame } from "@/lib/games/current";
import type { CanonicalGameId } from "@/lib/games/types";
import { getSongSlugs } from "@/lib/song-slug";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import type { AffectedChart } from "./ingestion/persistence";
import { catalogChartSchema } from "./ingestion/schema";

/** Above this many songs one route-wide revalidation replaces a call per song and locale. */
export const SONG_PAGE_BULK_THRESHOLD = 200;
export const SONG_PAGE_ROUTE = "/[locale]/db/[type]/[slug]";
const PEER_TIMEOUT_MS = 10_000;
// Publication precedes every invalidation, so readers may refetch immediately.
const EXPIRE_NOW = { expire: 0 };

/** What a peer receives. Without `affected`, the whole catalog changed. */
export const catalogRevalidationBody = z.object({
  affected: z.array(catalogChartSchema.pick({ songName: true, artist: true, chartType: true })).optional(),
});

export type CatalogPageScope = "none" | "songs" | "bulk";

/**
 * Invalidates this deployment's caches of a game's catalog. Every deployment serves the public API of
 * every game, so the data tags always go. Pages are rendered only by the game's own site.
 */
export async function revalidateCatalogLocal(
  game: CanonicalGameId,
  affected?: readonly AffectedChart[],
): Promise<{ pages: CatalogPageScope; count: number }> {
  const tags = catalogTags(game);
  revalidateTag(tags.uniqueSongs, EXPIRE_NOW);
  revalidateTag(tags.apiSongs, EXPIRE_NOW);
  if (GAME_SERVER_MODULES[game].reserved) revalidateTag(tags.reservedSongs, EXPIRE_NOW);
  if (game !== getCurrentGame().id) return { pages: "none", count: 0 };

  const slugs = affected && await songSlugs(game, affected);
  const bulk = !slugs || slugs.size > SONG_PAGE_BULK_THRESHOLD;
  if (bulk) revalidatePath(SONG_PAGE_ROUTE, "page");
  for (const locale of locales) {
    if (!bulk) {
      for (const slug of slugs) revalidatePath(`/${locale}/db/songs/${slug}`);
    }
    revalidatePath(`/${locale}/db/songs`);
  }
  return { pages: bulk ? "bulk" : "songs", count: slugs?.size ?? 0 };
}

/**
 * Invalidates a game's catalog caches here and on every peer in CATALOG_PEER_ORIGINS. Pass `affected`
 * when only those charts changed. A failure is logged and never thrown, because the catalog is already
 * written and published when this runs.
 */
export async function revalidateCatalog(
  game: CanonicalGameId,
  { affected, log }: { affected?: readonly AffectedChart[]; log: Logger },
): Promise<void> {
  try {
    const { pages, count } = await revalidateCatalogLocal(game, affected);
    log.info({ scope: pages, count }, "Catalog caches revalidated");
  } catch (err) {
    log.error({ err }, "Catalog cache revalidation failed");
  }
  const peers = catalogPeerOrigins();
  if (peers.length === 0) return;
  const token = process.env.ADMIN_UPDATE_TOKEN;
  if (!token) {
    log.error("Catalog peers skipped because ADMIN_UPDATE_TOKEN is not set");
    return;
  }
  const body = JSON.stringify({ affected });
  await Promise.all(peers.map(origin => revalidatePeer(origin, game, body, token, log)));
}

function catalogPeerOrigins(): string[] {
  return (process.env.CATALOG_PEER_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
}

async function revalidatePeer(origin: string, game: CanonicalGameId, body: string, token: string, log: Logger): Promise<void> {
  try {
    const url = new URL(`/api/admin/catalog/revalidate?game=${game}`, origin);
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Catalog peer answered ${response.status}`);
    log.info({ url: origin }, "Catalog peer revalidated");
  } catch (err) {
    log.error({ err, url: origin }, "Catalog peer revalidation failed");
  }
}

async function songSlugs(game: CanonicalGameId, affected: readonly AffectedChart[]): Promise<Set<string>> {
  const songs = new Map<string, { songName: string; artist: string; type: string }>();
  for (const chart of affected) {
    const song = { songName: chart.songName, artist: chart.artist, type: keyOf(game, "chartType", chart.chartType) };
    songs.set(JSON.stringify([song.songName, song.artist, song.type]), song);
  }
  const withSlugs = await getSongSlugs([...songs.values()], game);
  return new Set(withSlugs.map(song => song.slug));
}
