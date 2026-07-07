import { describe, expect, it } from "vitest";
import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";

const EXPECTED_SONG_CATALOG_CACHE_VALUE = "public, max-age=3600, stale-while-revalidate=86400";

describe("SONG_CATALOG_CACHE_HEADERS", () => {
  it("pins the successful song catalog response cache policy for browser, CDN, and Vercel caches", () => {
    expect(SONG_CATALOG_CACHE_HEADERS).toEqual({
      "Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "Vercel-CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
    });
  });
});
