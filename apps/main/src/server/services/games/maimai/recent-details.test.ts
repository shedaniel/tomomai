import { beforeEach, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { maimaiRecentSongDetails } from "@/lib/db/schema-pg";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.rows };
  }) };
});

import { loadMaimaiRecentDetails } from "./recent-details";

const stored = Object.fromEntries(Object.keys(getTableColumns(maimaiRecentSongDetails)).map((column, index) => [column, index]));

beforeEach(() => {
  state.queries = [];
  state.rows = [];
});

it("reads the playlogs of a page of plays in one query and leaves the others pending", async () => {
  state.rows = [Object.values({ ...stored, recentSongId: "2", venue: "Arcade", syncScore: null })];

  const details = await loadMaimaiRecentDetails([
    { recentSongId: BigInt(1), maxDxScore: null, metadata: null },
    { recentSongId: BigInt(2), maxDxScore: 1500, metadata: null },
  ]);

  expect(state.queries).toHaveLength(1);
  expect(state.queries[0].sql).toContain('from "user_recent_songs_detailed" where "user_recent_songs_detailed"."recentSongId" in ($1, $2)');
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
  expect(state.queries).toHaveLength(0);
});
