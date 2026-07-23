import { afterEach, describe, expect, it } from "vitest";
import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";
import { GET } from "./route";

const EXPECTED_SONG_CATALOG_CACHE_VALUE = "public, max-age=3600, stale-while-revalidate=86400";

const originalR2Url = process.env.NEXT_PUBLIC_R2_URL;

afterEach(() => {
  if (originalR2Url === undefined) {
    delete process.env.NEXT_PUBLIC_R2_URL;
  } else {
    process.env.NEXT_PUBLIC_R2_URL = originalR2Url;
  }
});

describe("SONG_CATALOG_CACHE_HEADERS", () => {
  it("pins the successful song catalog response cache policy for browser, CDN, and Vercel caches", () => {
    expect(SONG_CATALOG_CACHE_HEADERS).toEqual({
      "Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "Vercel-CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
    });
  });

  it("redirects the stable API path to the R2 catalog with the shared cache policy", () => {
    process.env.NEXT_PUBLIC_R2_URL = "https://cdn.example.test/";

    const response = GET();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cdn.example.test/api/v1/songs");
    for (const [name, value] of Object.entries(SONG_CATALOG_CACHE_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });
});
