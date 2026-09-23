import { queryAllUniqueSongs, querySongDetails, queryCatalogCharts } from "@/server/queries/songs";
import type { CanonicalGameId } from "@/lib/games/types";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Region } from "@/lib/types";

/**
 * Per-request memoized helpers for the public songs catalog.
 *
 * On a `/db/songs/[slug]` request the catalog is needed by:
 *   - `generateMetadata` in [slug]/page.tsx
 *   - `/db/[type]/layout.tsx` (SongsList initial data)
 *   - `/db/[type]/[slug]/page.tsx` (per-song JSON-LD)
 *   - `/db/@detail/[type]/[slug]/page.tsx` (drawer slot)
 * `cache()` collapses them into a single shared promise per render pass.
 *
 * Cross-request caching is handled inside the tRPC procedures (unstable_cache
 * + an in-process slug cache in lib/song-slug.ts).
 */
export const getAllUniqueSongsCached = cache(async (game: CanonicalGameId) => {
  return queryAllUniqueSongs(game);
});

export const getSongDetailsCached = cache(
  async (game: CanonicalGameId, songName: string, type: string, userId?: string | null, artist?: string, parentIds?: string[]) => {
    return querySongDetails(game, songName, type, userId, artist, parentIds);
  }
);

export const getCatalogChartsCached = cache(async (game: CanonicalGameId, region?: Region, version?: number) => {
  return unstable_cache(
    () => queryCatalogCharts(game, region, version),
    ["catalog-charts", game, region ?? "all", version?.toString() ?? "all"],
    { revalidate: 3600, tags: [`all-unique-songs:${game}`] },
  )();
});
