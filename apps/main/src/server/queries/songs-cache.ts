import { queryAllUniqueSongs, querySongDetails } from "@/server/queries/songs";
import { SongType } from "@/lib/types";
import { cache } from "react";

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
export const getAllUniqueSongsCached = cache(async () => {
  return queryAllUniqueSongs();
});

export const getSongDetailsCached = cache(
  async (songName: string, type: SongType, userId?: string | null, artist?: string) => {
    return querySongDetails(songName, type, userId, artist);
  }
);

export const getCatalogChartsCachedForGame = cache(async (game: import("@/lib/games/types").CanonicalGameId, region?: import("@/lib/types").Region, version?: number) => {
  const { unstable_cache } = await import("next/cache");
  const { queryCatalogChartsForGame } = await import("./songs");
  return unstable_cache(
    () => queryCatalogChartsForGame(game, region, version),
    ["catalog-charts", game, region ?? "all", version?.toString() ?? "all"],
    { revalidate: 3600, tags: [`all-unique-songs:${game}`] },
  )();
});
