import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import type { ConfiguredScoreAdapter, GameFetchResult } from "@/lib/games/types";

const state = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  fetch: vi.fn<ConfiguredScoreAdapter["fetch"]>(),
  validateToken: vi.fn<NonNullable<ConfiguredScoreAdapter["validateToken"]>>(),
  resolveCharts: vi.fn(),
  upsertScores: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const connection = drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    if (sql.includes('from "user"')) return { rows: [[false]] };
    if (sql.includes('from "user_tokens"')) return { rows: [["encrypted:stored-token"]] };
    if (sql.startsWith('insert into "fetch_sessions"')) return { rows: [["1"]] };
    if (sql.startsWith('insert into "user_snapshots"')) return { rows: [[1]] };
    return { rows: [] };
  });
  // Driver responses are fixtures; these tests assert SQL and orchestration, not database transaction semantics.
  return { db: Object.assign(connection, { transaction: (work: (tx: typeof connection) => Promise<unknown>) => work(connection) }) };
});
vi.mock("./score-storage", async importOriginal => ({
  ...await importOriginal<typeof import("./score-storage")>(),
  buildChartResolution: state.resolveCharts,
  upsertScoreData: state.upsertScores,
}));
vi.mock("@/lib/games/adapters/maimai/score", () => ({ maimaiScoreAdapter: {
  configured: true, fetch: state.fetch, validateToken: state.validateToken,
} }));
vi.mock("./chunithm/pipeline", () => ({ fetchPlayer: async (context: Parameters<ConfiguredScoreAdapter["fetch"]>[0]) => (await state.fetch(context)).result }));
vi.mock("@/lib/profile-cache", () => ({ revalidatePublicProfileForUser: state.revalidate }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/token-crypto", () => ({ encryptToken: (token: string) => `encrypted:${token}`, decryptToken: (token: string) => token.slice(10) }));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { persistFetchResult, startScoreFetch } from "./score-ingestion";

const fetched: GameFetchResult = {
  player: { displayName: "Player", rating: 10000, title: "Title", titleType: 0, iconUrl: "", totalPlayCount: 1, currentVersionPlayCount: 1 },
  scores: [],
};
const start = { userId: "same-user", game: "maimai" as const, region: "jp" as const, token: "new-token", flags: {} as Flags, options: { skipAfter: true } };
const persist = { userId: "same-user", game: "maimai" as const, region: "jp" as const, sessionId: BigInt(1), gameVersion: 14, fetched };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00+09:00"));
  vi.clearAllMocks();
  state.statements.length = 0;
  state.fetch.mockResolvedValue({ result: fetched });
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map(), songsById: new Map() });
  state.upsertScores.mockResolvedValue(new Map());
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("scopes session SQL to the user, game and region", async () => {
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  const sessionReads = state.statements.filter(query => query.sql.includes('from "fetch_sessions"'));
  expect(sessionReads).toHaveLength(2);
  for (const query of sessionReads) {
    for (const column of ["userId", "game", "region"]) expect(query.sql).toContain(`"fetch_sessions"."${column}" = $`);
    expect(query.params.slice(0, 3)).toEqual(["same-user", "maimai", "jp"]);
  }
  const sessionWrite = state.statements.find(query => query.sql.startsWith('update "fetch_sessions"'))!;
  expect(sessionWrite.sql).toMatch(/"fetch_sessions"\."id" = \$\d+ and "fetch_sessions"\."game" = \$\d+/);
  expect(sessionWrite.params).toContain("maimai");
});

it("rejects maintenance before validating or storing tokens or creating sessions", async () => {
  vi.setSystemTime(new Date("2026-09-27T04:00:00+09:00"));
  await expect(startScoreFetch(start)).rejects.toThrow("maintenance window (04:00 - 07:00 JST)");
  expect(state.statements).toEqual([]);
  expect(state.validateToken).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
});

it("rejects provider token validation before creating a fetch session", async () => {
  state.validateToken.mockRejectedValueOnce(new Error("single use token"));
  await expect(startScoreFetch({ ...start, token: undefined })).rejects.toThrow("single use token");
  expect(state.statements.some(query => query.sql.startsWith("insert"))).toBe(false);
  expect(state.fetch).not.toHaveBeenCalled();
});

it("persists the captured version and zero scores, then completes adapter extras before revalidation", async () => {
  const chart = { game: "maimai" as const, region: "jp" as const, version: 14, songName: "Zero", chartType: 0, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Zero|3|0", BigInt(7)]]), songsById: new Map([[BigInt(7), { id: BigInt(7), addedVersion: 14, levelPrecise: 140, difficulty: 3 }]]) });
  state.upsertScores.mockResolvedValue(new Map([["7-0-0-0-0-0", 8]]));
  const order: string[] = [];
  state.revalidate.mockImplementationOnce(async () => { order.push("revalidate"); });
  await persistFetchResult({ ...persist, fetched: { ...fetched, scores: [{ chart, scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 }] },
    persistExtra: async () => { order.push("extras"); },
  });
  expect(state.upsertScores.mock.calls[0][2]).toEqual([expect.objectContaining({ songId: BigInt(7), scoreValue: 0, secondaryScore: 0 })]);
  const snapshotWrite = state.statements.find(query => query.sql.startsWith('insert into "user_snapshots"'))!;
  expect(snapshotWrite.params).toContain(14);
  expect(order).toEqual(["extras", "revalidate"]);
});

it("retains typed optional fields and arbitrary metadata in persistence", async () => {
  const chart = { game: "chunithm" as const, region: "jp" as const, version: 9, songName: "Song", chartType: 0, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Song|3|0", BigInt(7)]]), songsById: new Map() });
  await persistFetchResult({ ...persist, game: "chunithm", gameVersion: 9, fetched: { ...fetched,
    recents: [{ chart, scoreValue: 1009000, secondaryScore: 0, comboStatus: 2, syncStatus: 0, clearStatus: 1, playedAt: new Date(100), track: 2, details: { judgement: "complete" } }],
    events: [{ name: "Progress", metadata: { steps: 10 } }],
    albums: [{ chart, capturedAt: new Date(100), imageKey: "album.webp", metadata: { provider: "test" } }],
  } });
  expect(state.statements.find(query => query.sql.startsWith('insert into "user_recent_songs"'))?.params).toContain('{"judgement":"complete"}');
  expect(state.statements.find(query => query.sql.startsWith('insert into "user_events"'))?.params).toContain('{"steps":10}');
  expect(state.statements.find(query => query.sql.startsWith('insert into "user_albums"'))?.params).toContain("album.webp");
});

it("rejects an expired persistence deadline before writing", async () => {
  await expect(persistFetchResult({ ...persist, deadline: Date.now() - 1 })).rejects.toThrow("timed out");
  expect(state.statements).toEqual([]);
});

it("aborts a timed-out provider and keeps its late result from overwriting failure", async () => {
  let finish!: (value: { result: GameFetchResult }) => void;
  state.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const started = await startScoreFetch(start);
  await vi.advanceTimersByTimeAsync(0);
  const signal = state.fetch.mock.calls[0][0].signal;
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(120001);
  await started.backgroundWork;
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toEqual(new Error("Fetch operation timed out after 2 minutes"));
  const writesAtFailure = state.statements.length;
  finish({ result: fetched });
  await vi.advanceTimersByTimeAsync(1);
  expect(state.statements).toHaveLength(writesAtFailure);
  expect(state.statements.some(query => query.sql.startsWith('insert into "user_snapshots"'))).toBe(false);
  expect(state.statements.find(query => query.sql.startsWith('update "fetch_sessions"'))?.params).toContain("failed");
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("keeps CHUNITHM subscription failures scoped to the failed session without deleting credentials or writing a snapshot", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "jp");
  state.fetch.mockRejectedValueOnce(new Error("SUBSCRIPTION_REQUIRED: CHUNITHM-NET subscription required"));
  const started = await startScoreFetch({ ...start, game: "chunithm", token: undefined });
  await started.backgroundWork;
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ game: "chunithm", region: "jp", token: "stored-token" }));
  expect(state.statements.some(query => query.sql.startsWith('insert into "user_snapshots"'))).toBe(false);
  expect(state.statements.some(query => query.sql.startsWith("delete") || query.sql.startsWith('update "user_tokens"'))).toBe(false);
  expect(state.statements.find(query => query.sql.startsWith('update "fetch_sessions"'))?.params).toEqual(expect.arrayContaining(["failed", "chunithm"]));
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("persists CHUNITHM charts only in their captured game, region and version", async () => {
  const chart = { game: "chunithm" as const, region: "jp" as const, version: 9, songName: "Raw　Title", chartType: 0, difficulty: 3 };
  const score = { chart, scoreValue: 1009000, secondaryScore: 0, comboStatus: 1, syncStatus: 0, clearStatus: 1 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Raw　Title|3|0", BigInt(7)]]), songsById: new Map([[BigInt(7), { id: BigInt(7), addedVersion: 9, levelPrecise: 140, difficulty: 3 }]]) });
  state.upsertScores.mockResolvedValue(new Map([["7-1009000-0-1-0-1", 8]]));
  await persistFetchResult({ ...persist, game: "chunithm", gameVersion: 9, fetched: { ...fetched, scores: [
    score,
    { ...score, chart: { ...chart, game: "maimai" } },
    { ...score, chart: { ...chart, region: "intl" } },
    { ...score, chart: { ...chart, version: 8 } },
  ] } });
  expect(state.resolveCharts).toHaveBeenCalledWith(expect.anything(), "chunithm", "jp", 9);
  expect(state.upsertScores).toHaveBeenCalledWith(expect.anything(), "chunithm", [expect.objectContaining({ songId: BigInt(7), scoreValue: 1009000 })]);
  const snapshot = state.statements.find(query => query.sql.startsWith('insert into "user_snapshots"'))!;
  expect(snapshot.params).toEqual(expect.arrayContaining(["chunithm", 9]));
  expect(state.statements.find(query => query.sql.startsWith('insert into "snapshot_rankings"'))?.params).toEqual(expect.arrayContaining(["chunithm", 8]));
});
