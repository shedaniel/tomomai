import { afterEach, describe, expect, it } from "vitest";
import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";
import { GET } from "./route";
import { NextRequest } from "next/server";
import { GET as getParents } from "../parents/route";

const EXPECTED_SONG_CATALOG_CACHE_VALUE = "public, max-age=3600, stale-while-revalidate=86400";

const originalR2Url = process.env.NEXT_PUBLIC_R2_URL;

afterEach(async () => {
  if (originalR2Url === undefined) {
    delete process.env.NEXT_PUBLIC_R2_URL;
  } else {
    process.env.NEXT_PUBLIC_R2_URL = originalR2Url;
  }
});

describe("SONG_CATALOG_CACHE_HEADERS", async () => {
  it("pins the successful song catalog response cache policy for browser, CDN, and Vercel caches", async () => {
    expect(SONG_CATALOG_CACHE_HEADERS).toEqual({
      "Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
      "Vercel-CDN-Cache-Control": EXPECTED_SONG_CATALOG_CACHE_VALUE,
    });
  });

  it("redirects the stable API path to the R2 catalog with the shared cache policy", async () => {
    process.env.NEXT_PUBLIC_R2_URL = "https://cdn.example.test/";

    const response = await GET(new NextRequest("https://example.test/api/v1/games/maimai/songs?region=jp&gameVersion=11"), { params: Promise.resolve({ game: "maimai" }) });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cdn.example.test/api/v1/games/maimai/songs/jp/11");
    for (const [name, value] of Object.entries(SONG_CATALOG_CACHE_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });
  it("rejects missing, malformed, and unknown slice parameters", async () => {
    for (const query of ["", "?region=jp", "?region=jp&gameVersion=", "?region=jp&gameVersion=999", "?region=jp&gameVersion=1.5", "?region=bad&gameVersion=11"]) {
      expect((await GET(new NextRequest(`https://example.test/api/v1/games/maimai/songs${query}`), { params: Promise.resolve({ game: "maimai" }) })).status).toBe(400);
    }
  });

  it("redirects the parent dictionary to the new R2 namespace", async () => {
    process.env.NEXT_PUBLIC_R2_URL = "https://cdn.example.test";
    const response = await getParents(new NextRequest("https://example.test/api/v1/games/maimai/parents"), { params: Promise.resolve({ game: "maimai" }) });
    expect(response.headers.get("location")).toBe("https://cdn.example.test/api/v1/games/maimai/parents");
    expect(response.headers.get("Cache-Control")).toBe(EXPECTED_SONG_CATALOG_CACHE_VALUE);
  });

});
