export const SONG_CATALOG_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  "Vercel-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
} as const;
