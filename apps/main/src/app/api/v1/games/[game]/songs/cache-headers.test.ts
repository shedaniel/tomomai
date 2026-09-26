import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import { GET as getParents } from "../parents/route";
import { GET as getVersions } from "./versions/route";

const EXPECTED_SONG_CATALOG_CACHE_VALUE = "public, max-age=3600, stale-while-revalidate=86400";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_R2_URL", "https://cdn.example.test/");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T00:00:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("catalog HTTP reads", () => {
  it.each([["maimai", 11], ["chunithm", 9]] as const)("redirects the %s API path to the R2 catalog with the shared cache policy", async (game, version) => {
    const response = await GET(new NextRequest(`https://example.test/api/v1/games/${game}/songs?region=jp&gameVersion=${version}`), { params: Promise.resolve({ game }) });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://cdn.example.test/api/v1/games/${game}/songs/jp/${version}`);
    for (const name of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) {
      expect(response.headers.get(name)).toBe(EXPECTED_SONG_CATALOG_CACHE_VALUE);
    }
  });
  it("rejects missing, malformed, and unknown slice parameters", async () => {
    for (const query of ["", "?region=jp", "?region=jp&gameVersion=", "?region=jp&gameVersion=999", "?region=jp&gameVersion=1.5", "?region=bad&gameVersion=11"]) {
      expect((await GET(new NextRequest(`https://example.test/api/v1/games/maimai/songs${query}`), { params: Promise.resolve({ game: "maimai" }) })).status).toBe(400);
    }
  });

  it.each(["maimai", "chunithm"])("redirects the %s parent dictionary to its R2 namespace", async game => {
    const response = await getParents(new NextRequest(`https://example.test/api/v1/games/${game}/parents`), { params: Promise.resolve({ game }) });
    expect(response.headers.get("location")).toBe(`https://cdn.example.test/api/v1/games/${game}/parents`);
    expect(response.headers.get("Cache-Control")).toBe(EXPECTED_SONG_CATALOG_CACHE_VALUE);
  });
  it.each([["jp", 9], ["intl", 8]] as const)("exposes CHUNITHM %s versions before player rollout", async (region, currentVersion) => {
    const response = await getVersions(new NextRequest(`https://example.test/api/v1/games/chunithm/songs/versions?region=${region}`), { params: Promise.resolve({ game: "chunithm" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ game: "chunithm", currentVersion, versions: expect.arrayContaining([expect.objectContaining({ id: currentVersion })]) });
    expect(response.headers.get("Cache-Control")).toBe(EXPECTED_SONG_CATALOG_CACHE_VALUE);
  });
  it("rejects unavailable CHUNITHM catalog regions", async () => {
    const response = await getVersions(new NextRequest("https://example.test/api/v1/games/chunithm/songs/versions?region=cn"), { params: Promise.resolve({ game: "chunithm" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNSUPPORTED_REGION");
  });
});
