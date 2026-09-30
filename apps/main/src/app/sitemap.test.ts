import { describe, expect, it, vi } from "vitest";
import { REGIONS, type CanonicalGameId, type Region } from "@/lib/games/ids";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const current = vi.hoisted(() => ({
  game: "maimai" as CanonicalGameId,
  regions: [] as Region[],
  cacheKeys: [] as string[][],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(load: () => Promise<T>, keyParts: string[]) => {
    current.cacheKeys.push(keyParts);
    return load;
  },
}));
vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame(current.game, current.regions) };
});
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/lib/posts", () => ({
  getAllPostsMeta: () => [{ slug: "2026-09-01-update", canonicalSlug: "update", date: "2026-09-01" }],
  getAvailableTranslations: () => ["en"],
}));
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import sitemap from "./sitemap";

async function sitemapFor(game: CanonicalGameId, regions: Region[]) {
  Object.assign(current, { game, regions, cacheKeys: [] });
  proxy.reset();
  // The published player has snapshots of the game in every region, found by a query for the game and a region.
  proxy.answer(({ params }) => params.includes(game) && REGIONS.some(region => params.includes(region))
    ? [{ username: "player", latestSnapshotAt: "2026-09-20 00:00:00" }]
    : []);
  const entries = await sitemap();
  return {
    paths: entries.map(entry => entry.url.replace("https://site.test", "")),
    cacheKeys: current.cacheKeys,
  };
}

describe("sitemap", () => {
  it("lists only the CHUNITHM catalog and its players on the CHUNITHM site", async () => {
    const { paths, cacheKeys } = await sitemapFor("chunithm", ["intl", "jp"]);
    expect(paths).toEqual(["/en", "/en/db/songs", "/en/profile/player"]);
    expect(cacheKeys).toEqual([["sitemap", "chunithm"]]);
  });

  it("lists every visible maimai section and the posts on the maimai site", async () => {
    const { paths, cacheKeys } = await sitemapFor("maimai", ["intl", "jp", "cn"]);
    expect(paths).toEqual([
      "/en",
      "/en/db/songs",
      "/en/db/stats",
      "/en/db/events",
      "/en/db/posts",
      "/en/db/posts/2026-09-01-update",
      "/en/profile/player",
    ]);
    expect(cacheKeys).toEqual([["sitemap", "maimai"]]);
  });

  it("matches no player while the game has no enabled region", async () => {
    const { paths } = await sitemapFor("maimai", []);
    expect(paths).not.toContain("/en/db/posts");
    expect(paths).not.toContain("/en/profile/player");
    // Postgres matches nothing against the empty region list, which only the statement shows.
    expect(proxy.queries[0].sql).toMatch(/and false\)/);
  });
});
