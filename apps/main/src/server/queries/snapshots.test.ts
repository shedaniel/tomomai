import { beforeEach, expect, it, vi } from "vitest";

const INTERNAL_ID = 41;
const stored = vi.hoisted(() => ({
  user_snapshots: {
    id: 41, publicId: "snapshot", userId: "owner", game: "chunithm", region: "jp", metadata: { provider: "test" }, fetchedAt: "2026-09-01 00:00:00",
    gameVersion: 9, rating: 1700, courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
    iconUrl: "", displayName: "Player", title: "Title", titleType: 0,
  },
  user_events: {
    metadata: { steps: 10 }, eventType: null, name: "Map progress", currentDistance: 10, nextRewardDistance: null, state: null,
    imageUrl: null, eventPeriodStart: null, eventPeriodEnd: null,
  },
} as Record<string, Record<string, unknown>>));
const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[] }));

// Answers each query with the stored row's values for exactly the columns it selects, like Postgres would.
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    const table = /^select .*? from "(\w+)"/.exec(sql)?.[1];
    if (table === "snapshot_scores") return { rows: [["song:j9", "Song", "Artist", "", 4, 0, "14+", 145, "Original", 9, 1009000, 0, 3, 0, 1]] };
    const record = table ? stored[table] : undefined;
    if (!record) return { rows: [] };
    if (table === "user_snapshots" && !(params.includes(record.userId) && params.includes(record.game))) return { rows: [] };
    const columns = [...sql.slice(0, sql.indexOf(` from "${table}"`)).matchAll(/(?:"\w+"\.)?"(\w+)"/g)].map(([, column]) => column);
    return { rows: [columns.map(column => record[column])] };
  }) };
});
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));

import { fetchLatestSnapshotData, fetchSnapshotData, fetchSnapshotDataByPublicId, fetchSnapshotRankings } from "./snapshots";

beforeEach(() => { state.queries = []; });

it.each([
  ["by public id", () => fetchSnapshotData("chunithm", "owner", "snapshot", "jp")],
  ["latest", () => fetchLatestSnapshotData("chunithm", "owner", "jp")],
])("reads the %s snapshot through its internal id within the game, without handing out the id, owner or raw metadata", async (_, read) => {
  const result = await read();
  expect(result?.snapshot).toStrictEqual({
    publicId: "snapshot", game: "chunithm", displayName: "Player", rating: 1700, gameVersion: 9, fetchedAt: new Date("2026-09-01T00:00:00Z"),
    title: "Title", titleType: 0, iconUrl: "", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
  });
  expect(result?.events).toStrictEqual([{
    eventType: null, name: "Map progress", currentDistance: 10, nextRewardDistance: null, state: null, imageUrl: null, eventPeriodStart: null, eventPeriodEnd: null,
  }]);
  expect(result?.songs[0]).toMatchObject({ difficultyCode: 4, typeCode: 0, comboStatus: 3, scoreValue: 1009000 });
  const [header, scores, events] = state.queries;
  expect(state.queries).toHaveLength(3);
  expect(header.params).toContain("chunithm");
  // Children are reached through the game-checked snapshot, and the composite keys keep them in its game.
  expect(scores.params).toEqual([INTERNAL_ID]);
  // The events index leads with game, so the game predicate stays.
  expect(events.params).toEqual(["chunithm", INTERNAL_ID]);
});

it("reads the owner's snapshot by public id in whichever region it was fetched, and nothing of another owner or game", async () => {
  const result = await fetchSnapshotDataByPublicId("chunithm", "owner", "snapshot");
  expect(result).toMatchObject({ region: "jp", snapshot: { publicId: "snapshot", game: "chunithm" } });
  expect(result?.songs).toHaveLength(1);
  expect(result?.snapshot).not.toHaveProperty("region");
  await expect(fetchSnapshotDataByPublicId("chunithm", "stranger", "snapshot")).resolves.toBeNull();
  await expect(fetchSnapshotDataByPublicId("maimai", "owner", "snapshot")).resolves.toBeNull();
});

it("reads stored rankings only through the owner's snapshot", async () => {
  await fetchSnapshotRankings("maimai", "owner", { publicId: "snapshot", gameVersion: 13 });
  const [query] = state.queries;
  expect(query.sql).toContain('"user_snapshots"."publicId" = $');
  expect(query.sql).toContain('"user_snapshots"."userId" = $');
  expect(query.params).toEqual(expect.arrayContaining(["snapshot", "maimai", "owner"]));
});
