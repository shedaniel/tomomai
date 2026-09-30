import { beforeEach, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { maimaiRecentSongDetails } from "@/lib/db/schema-pg";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { loadMaimaiRecentDetails } from "./recent-details";

const stored = Object.fromEntries(Object.keys(getTableColumns(maimaiRecentSongDetails)).map((column, index) => [column, index]));

beforeEach(() => proxy.reset());

it("reads the playlogs of a page of plays in one query and leaves the others pending", async () => {
  proxy.respond([{ ...stored, recentSongId: "2", venue: "Arcade", syncScore: null }]);

  const details = await loadMaimaiRecentDetails([
    { recentSongId: BigInt(1), maxSecondaryScore: null, metadata: null },
    { recentSongId: BigInt(2), maxSecondaryScore: 1500, metadata: null },
  ]);

  expect(proxy.queries.map(({ table, params }) => [table, params])).toEqual([["user_recent_songs_detailed", [BigInt(1), BigInt(2)]]]);
  expect(details[0]).toEqual({ game: "maimai", maxDxScore: 0, playlog: null });
  expect(details[1]).toEqual({
    game: "maimai",
    maxDxScore: 1500,
    playlog: {
      venue: "Arcade",
      combo: stored.combo,
      maxCombo: stored.maxCombo,
      syncScore: null,
      maxSyncScore: stored.maxSyncScore,
      rating: stored.rating,
      ratingChange: stored.ratingChange,
      fast: stored.fastCount,
      late: stored.lateCount,
      notes: Object.fromEntries(["tap", "hold", "slide", "touch", "break"].map(kind => [kind, {
        cPerfect: stored[`${kind}CPerfect`],
        perfect: stored[`${kind}Perfect`],
        great: stored[`${kind}Great`],
        good: stored[`${kind}Good`],
        miss: stored[`${kind}Miss`],
      }])),
    },
  });
});

it("does not query for an empty page", async () => {
  await expect(loadMaimaiRecentDetails([])).resolves.toEqual([]);
  expect(proxy.queries).toHaveLength(0);
});
