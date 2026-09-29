import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import type { GameFetchResult, ScoreSource } from "./types";

const state = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  fetch: vi.fn<ScoreSource["fetch"]>(),
  validateToken: vi.fn<NonNullable<ScoreSource["validateToken"]>>(),
  resolveCharts: vi.fn(),
  writeScores: vi.fn(),
  revalidate: vi.fn(),
  resolveFlags: vi.fn(),
  albumPreference: false as boolean | null,
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const connection = drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    if (sql.includes('from "user"')) return { rows: [[state.albumPreference]] };
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
  writeSnapshotScores: state.writeScores,
}));
vi.mock("./maimai", () => ({ maimaiServerModule: {
  scores: { fetch: state.fetch, validateToken: state.validateToken },
} }));
vi.mock("./chunithm", () => ({ chunithmServerModule: {
  scores: { fetch: state.fetch },
} }));
vi.mock("@/lib/profile-cache", () => ({ revalidatePublicProfileForUser: state.revalidate }));
vi.mock("@/lib/flags", () => ({ resolveFlagsForUser: state.resolveFlags }));
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
  state.albumPreference = false;
  state.fetch.mockResolvedValue({ result: fetched });
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map(), songsById: new Map() });
  state.writeScores.mockResolvedValue(null);
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

it("resolves the user's flags when the caller does not pass them", async () => {
  const flags = { userscriptFetch: true } as Flags;
  state.resolveFlags.mockResolvedValueOnce(flags);
  const { flags: _omitted, ...withoutFlags } = start;
  const started = await startScoreFetch(withoutFlags);
  await started.backgroundWork;
  expect(state.resolveFlags).toHaveBeenCalledWith("same-user");
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ flags }));
});

it("rejects maintenance before validating or storing tokens or creating sessions", async () => {
  vi.setSystemTime(new Date("2026-09-27T04:00:00+09:00"));
  await expect(startScoreFetch(start)).rejects.toThrow("maintenance window (04:00 - 07:00 JST)");
  expect(state.statements).toEqual([]);
  expect(state.validateToken).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
});

it("asks for an album preference only in regions where the game fetches albums", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,cn");
  state.albumPreference = null;
  await expect(startScoreFetch(start)).rejects.toThrow("NO_USE_ALBUMS_SETTINGS");
  const started = await startScoreFetch({ ...start, region: "cn" });
  await started.backgroundWork;
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ region: "cn", shouldFetchAlbums: false }));
});

it("rejects provider token validation before creating a fetch session", async () => {
  state.validateToken.mockRejectedValueOnce(new Error("single use token"));
  await expect(startScoreFetch({ ...start, token: undefined })).rejects.toThrow("single use token");
  expect(state.statements.some(query => query.sql.startsWith("insert"))).toBe(false);
  expect(state.fetch).not.toHaveBeenCalled();
});

it("persists the captured version and zero scores, then completes score source extras before revalidation", async () => {
  const chart = { game: "maimai" as const, region: "jp" as const, version: 14, songName: "Zero", chartType: 0, difficulty: 3 };
  const song = { id: BigInt(7), addedVersion: 14, levelPrecise: 140, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Zero|3|0", BigInt(7)]]), songsById: new Map([[BigInt(7), song]]) });
  const order: string[] = [];
  state.revalidate.mockImplementationOnce(async () => { order.push("revalidate"); });
  await persistFetchResult({ ...persist, fetched: { ...fetched, scores: [{ chart, scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 }] },
    persistExtra: async () => { order.push("extras"); },
  });
  expect(state.writeScores).toHaveBeenCalledWith(expect.anything(), { game: "maimai", snapshotId: 1, gameVersion: 14, scores: [
    { song, values: { songId: BigInt(7), scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 } },
  ] });
  const snapshotWrite = state.statements.find(query => query.sql.startsWith('insert into "user_snapshots"'))!;
  expect(snapshotWrite.params).toContain(14);
  expect(order).toEqual(["extras", "revalidate"]);
});

it("persists recent details as the recent row metadata", async () => {
  const chart = { game: "chunithm" as const, region: "jp" as const, version: 9, songName: "Song", chartType: 0, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Song|3|0", BigInt(7)]]), songsById: new Map() });
  await persistFetchResult({ ...persist, game: "chunithm", gameVersion: 9, fetched: { ...fetched,
    recents: [{ chart, scoreValue: 1009000, secondaryScore: 0, comboStatus: 2, syncStatus: 0, clearStatus: 1, playedAt: new Date(100), track: 2, details: { judgement: "complete" } }],
  } });
  expect(state.statements.find(query => query.sql.startsWith('insert into "user_recent_songs"'))?.params).toContain('{"judgement":"complete"}');
});

it.each([
  { game: "maimai", difficulty: 3, expected: { difficulty: "master", musicType: "std" } },
  { game: "chunithm", difficulty: 4, expected: { difficulty: "ultima", musicType: "standard" } },
] as const)("reports unmatched $game charts with that game's own code keys", async ({ game, difficulty, expected }) => {
  const chart = { game, region: "jp" as const, version: 9, songName: "Missing", chartType: 0, difficulty };
  await persistFetchResult({ ...persist, game, gameVersion: 9, fetched: { ...fetched,
    scores: [{ chart, scoreValue: 1, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 }],
  } });
  const report = state.statements
    .filter(query => query.sql.startsWith('update "fetch_sessions"'))
    .flatMap(query => query.params)
    .find((param): param is string => typeof param === "string" && param.includes("notFoundScores"));
  expect(JSON.parse(JSON.parse(report!))).toEqual({ notFoundScores: [{ songName: "Missing", ...expected }] });
});

it("persists events against the new snapshot and game", async () => {
  await persistFetchResult({ ...persist, fetched: { ...fetched, events: [{ name: "Progress", currentDistance: 10 }] } });
  const eventWrite = state.statements.find(query => query.sql.startsWith('insert into "user_events"'))!;
  expect(eventWrite.params).toEqual(expect.arrayContaining(["Progress", 10, "maimai", 1]));
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
  const song = { id: BigInt(7), addedVersion: 9, levelPrecise: 140, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([["Raw　Title|3|0", BigInt(7)]]), songsById: new Map([[BigInt(7), song]]) });
  await persistFetchResult({ ...persist, game: "chunithm", gameVersion: 9, fetched: { ...fetched, scores: [
    score,
    { ...score, chart: { ...chart, game: "maimai" } },
    { ...score, chart: { ...chart, region: "intl" } },
    { ...score, chart: { ...chart, version: 8 } },
  ] } });
  expect(state.resolveCharts).toHaveBeenCalledWith(expect.anything(), "chunithm", "jp", 9);
  expect(state.writeScores).toHaveBeenCalledWith(expect.anything(), { game: "chunithm", snapshotId: 1, gameVersion: 9, scores: [
    { song, values: { songId: BigInt(7), scoreValue: 1009000, secondaryScore: 0, comboStatus: 1, syncStatus: 0, clearStatus: 1 } },
  ] });
  const snapshot = state.statements.find(query => query.sql.startsWith('insert into "user_snapshots"'))!;
  expect(snapshot.params).toEqual(expect.arrayContaining(["chunithm", 9]));
});
