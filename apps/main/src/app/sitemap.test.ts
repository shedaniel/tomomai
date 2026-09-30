import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

const current = vi.hoisted(() => ({
  game: "maimai" as CanonicalGameId,
  regions: [] as Region[],
  cacheKeys: [] as string[][],
  joins: [] as unknown[],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(load: () => Promise<T>, keyParts: string[]) => {
    current.cacheKeys.push(keyParts);
    return load;
  },
}));
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), current.regions) };
});
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/lib/posts", () => ({
  getAllPostsMeta: () => [{ slug: "2026-09-01-update", canonicalSlug: "update", date: "2026-09-01" }],
  getAvailableTranslations: () => ["en"],
}));
vi.mock("@/lib/db", () => {
  const query = {
    select: () => query,
    from: () => query,
    innerJoin: (_table: unknown, condition: unknown) => {
      current.joins.push(condition);
      return query;
    },
    where: () => query,
    groupBy: () => query,
    orderBy: () => query,
    limit: async () => [{ username: "player", latestSnapshotAt: new Date("2026-09-20") }],
  };
  return { db: query };
});

import sitemap from "./sitemap";

async function sitemapFor(game: CanonicalGameId, regions: Region[]) {
  Object.assign(current, { game, regions, cacheKeys: [], joins: [] });
  const entries = await sitemap();
  const [join] = current.joins;
  return {
    paths: entries.map(entry => entry.url.replace("https://site.test", "")),
    cacheKeys: current.cacheKeys,
    profileJoin: new PgDialect().sqlToQuery(join as SQL),
  };
}

describe("sitemap", () => {
  it("lists only the CHUNITHM catalog and its players on the CHUNITHM site", async () => {
    const { paths, cacheKeys, profileJoin } = await sitemapFor("chunithm", ["intl", "jp"]);
    expect(paths).toEqual(["/en", "/en/db/songs", "/en/profile/player"]);
    expect(cacheKeys).toEqual([["sitemap", "chunithm"]]);
    expect(profileJoin.sql).toContain('"user_snapshots"."game" = $1');
    expect(profileJoin.sql).toContain('"user_snapshots"."region" in ($2, $3)');
    expect(profileJoin.params).toEqual(["chunithm", "intl", "jp"]);
  });

  it("lists every visible maimai section and the posts on the maimai site", async () => {
    const { paths, cacheKeys, profileJoin } = await sitemapFor("maimai", ["intl", "jp", "cn"]);
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
    expect(profileJoin.params).toEqual(["maimai", "intl", "jp", "cn"]);
  });

  it("matches no player while the game has no enabled region", async () => {
    const { paths, profileJoin } = await sitemapFor("maimai", []);
    expect(paths).not.toContain("/en/db/posts");
    expect(profileJoin.sql).toMatch(/and false\)$/);
  });
});
