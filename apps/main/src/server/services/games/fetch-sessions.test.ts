import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { fetchSessions } from "@/lib/db/schema-pg";
import type { Flags } from "@/lib/flags";
import type { NotFoundScore } from "@/lib/api/schemas";
import type { GameFetchResult, PersistedSnapshotContext, ScoreSource } from "./types";

const state = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  fetch: vi.fn<ScoreSource["fetch"]>(),
  rejectStoredToken: vi.fn<NonNullable<ScoreSource["rejectStoredToken"]>>(),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child() { return this; } },
  persist: vi.fn(),
  resolveFlags: vi.fn(),
  albumPreference: false as boolean | null,
  storedToken: "stored-token" as string | null,
  pendingSessions: [] as unknown[][],
  recentSessions: [] as unknown[][],
  latestSession: [] as unknown[][],
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    if (sql.includes('from "user"')) return { rows: [[state.albumPreference]] };
    if (sql.includes('from "user_tokens"')) return { rows: state.storedToken === null ? [] : [[`encrypted:${state.storedToken}`]] };
    if (sql.startsWith('select "publicId"')) return { rows: state.latestSession };
    if (sql.startsWith("select") && sql.includes('from "fetch_sessions"')) {
      return { rows: sql.includes('"fetch_sessions"."status" = $') ? state.pendingSessions : state.recentSessions };
    }
    if (sql.startsWith('insert into "fetch_sessions"')) return { rows: [["1"]] };
    return { rows: [] };
  }) };
});
vi.mock("./registry", () => ({ GAME_SERVER_MODULES: {
  maimai: { scores: { fetch: state.fetch, rejectStoredToken: state.rejectStoredToken } },
  chunithm: { scores: { fetch: state.fetch } },
} }));
vi.mock("./snapshot-persistence", async importOriginal => ({
  ...await importOriginal<typeof import("./snapshot-persistence")>(),
  persistFetchResult: state.persist,
}));
vi.mock("@/lib/flags", () => ({ resolveFlagsForUser: state.resolveFlags }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => state.log }));
vi.mock("@/lib/token-crypto", () => ({ encryptToken: (token: string) => `encrypted:${token}`, decryptToken: (token: string) => token.slice(10) }));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { FetchStageError } from "./fetch-run";
import { FetchStartError } from "./fetch-errors";
import { getScoreFetchStatus, startScoreFetch } from "./fetch-sessions";

const fetched: GameFetchResult = {
  player: { displayName: "Player", rating: 10000, title: "Title", titleType: 0, iconUrl: "", totalPlayCount: 1, currentVersionPlayCount: 1 },
  scores: [],
};
const start = { userId: "same-user", game: "maimai" as const, region: "jp" as const, token: "new-token", flags: {} as Flags, options: { skipAfter: true } };
const persisted: PersistedSnapshotContext = { game: "maimai", userId: "same-user", region: "jp", snapshotId: 1, gameVersion: 14, chartResolution: new Map() };
const missing: NotFoundScore[] = [{ songName: "Missing", difficulty: 3, type: 0 }];

function sessionUpdates() {
  return state.statements.filter(query => query.sql.startsWith('update "fetch_sessions"'));
}

function sessionStatuses() {
  return sessionUpdates().flatMap(query => query.params.filter(param => param === "completed" || param === "failed"));
}

function sessionRow(startedSecondsAgo: number) {
  const startedAt = new Date(Date.now() - startedSecondsAgo * 1000).toISOString().replace("T", " ").slice(0, 19);
  const values: Record<string, unknown> = { id: "9", publicId: "session", userId: "same-user", game: "maimai", region: "jp", status: "pending", startedAt };
  return Object.keys(getTableColumns(fetchSessions)).map(column => values[column] ?? null);
}

async function refusal(input: Parameters<typeof startScoreFetch>[0]): Promise<FetchStartError> {
  const error = await startScoreFetch(input).then(() => null, (error: unknown) => error);
  if (!(error instanceof FetchStartError)) throw new Error(`Expected a FetchStartError, got ${String(error)}`);
  return error;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00+09:00"));
  vi.clearAllMocks();
  state.statements.length = 0;
  state.albumPreference = false;
  state.storedToken = "stored-token";
  state.pendingSessions = [];
  state.recentSessions = [];
  state.latestSession = [];
  state.fetch.mockResolvedValue({ result: fetched });
  state.rejectStoredToken.mockReturnValue(null);
  state.persist.mockResolvedValue({ context: persisted, notFoundScores: [] });
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("scopes session reads to the user, game and region and updates a session by its id alone", async () => {
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  const sessionReads = state.statements.filter(query => query.sql.includes('from "fetch_sessions"'));
  expect(sessionReads).toHaveLength(2);
  for (const query of sessionReads) {
    for (const column of ["userId", "game", "region"]) expect(query.sql).toContain(`"fetch_sessions"."${column}" = $`);
    expect(query.params.slice(0, 3)).toEqual(["same-user", "maimai", "jp"]);
  }
  const [completion] = sessionUpdates();
  expect(completion.sql).toMatch(/where "fetch_sessions"\."id" = \$\d+$/);
  expect(completion.params.at(-1)).toBe(BigInt(1));
});

it("resolves the user's flags when the caller does not pass them", async () => {
  const flags = { userscriptFetch: true } as Flags;
  state.resolveFlags.mockResolvedValueOnce(flags);
  const { flags: _omitted, ...withoutFlags } = start;
  const started = await startScoreFetch(withoutFlags);
  await started.backgroundWork;
  expect(state.resolveFlags).toHaveBeenCalledWith("same-user");
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ flags }), expect.anything());
});

it("saves a newly provided token before refusing a fetch during maintenance", async () => {
  vi.setSystemTime(new Date("2026-09-27T04:00:00+09:00"));
  const error = await refusal(start);
  expect(error).toMatchObject({
    code: "MAINTENANCE",
    message: "MAINTENANCE: Cannot fetch data during maintenance window (04:00 - 07:00 JST)",
    retryAfterSeconds: 3 * 60 * 60,
  });
  expect(state.statements.map(query => query.sql.slice(0, 25))).toEqual(['insert into "user_tokens"']);
  expect(state.fetch).not.toHaveBeenCalled();
});

it.each([
  { code: "NO_TOKEN_FOUND", arrange: () => { state.storedToken = null; }, retryAfterSeconds: undefined },
  { code: "FETCH_IN_PROGRESS", arrange: () => { state.pendingSessions = [sessionRow(60)]; }, retryAfterSeconds: undefined },
  { code: "RATE_LIMITED", arrange: () => { state.recentSessions = Array.from({ length: 5 }, () => sessionRow(4 * 60)); }, retryAfterSeconds: 60 },
])("refuses with $code before creating a session", async ({ code, arrange, retryAfterSeconds }) => {
  arrange();
  const error = await refusal({ ...start, token: undefined });
  expect(error.code).toBe(code);
  expect(error.message.startsWith(`${code}: `)).toBe(true);
  expect(error.retryAfterSeconds).toBe(retryAfterSeconds);
  expect(state.statements.some(query => query.sql.startsWith('insert into "fetch_sessions"'))).toBe(false);
});

it("fails a session left pending past three minutes and admits the new fetch", async () => {
  state.pendingSessions = [sessionRow(4 * 60)];
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  const [sweep] = sessionUpdates();
  expect(sweep.params).toEqual(expect.arrayContaining(["failed", "Fetch timed out after 3 minutes", BigInt(9)]));
  expect(state.statements.some(query => query.sql.startsWith('insert into "fetch_sessions"'))).toBe(true);
});

it("asks for an album preference only in regions where the game fetches albums", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,cn");
  state.albumPreference = null;
  expect((await refusal(start)).code).toBe("NO_USE_ALBUMS_SETTINGS");
  const started = await startScoreFetch({ ...start, region: "cn" });
  await started.backgroundWork;
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ region: "cn", shouldFetchAlbums: false }), expect.anything());
});

it("refuses a stored token the score source rejects before creating a fetch session", async () => {
  const refusal = new FetchStartError("CN_COOKIES_SINGLE_USE", "single use token");
  state.rejectStoredToken.mockReturnValueOnce(refusal);
  await expect(startScoreFetch({ ...start, token: undefined })).rejects.toBe(refusal);
  expect(state.rejectStoredToken).toHaveBeenCalledWith("stored-token");
  expect(state.statements.some(query => query.sql.startsWith("insert"))).toBe(false);
  expect(state.fetch).not.toHaveBeenCalled();
});

it("does not ask the score source about a newly supplied token", async () => {
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  expect(state.rejectStoredToken).not.toHaveBeenCalled();
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ token: "new-token" }), expect.anything());
});

it("persists the fetched result for the session's game, region and version", async () => {
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  const { gameVersion } = state.fetch.mock.calls[0][0];
  expect(state.persist).toHaveBeenCalledExactlyOnceWith({
    game: "maimai", region: "jp", userId: "same-user", gameVersion, fetched, deadline: expect.any(Number),
  });
  expect(sessionStatuses()).toEqual(["completed"]);
  expect(sessionUpdates()[0].sql).not.toContain('"extraData"');
});

it("stores unmatched scores on the completed session as a JSON object", async () => {
  state.persist.mockResolvedValueOnce({ context: persisted, notFoundScores: missing });
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  const [completion] = sessionUpdates();
  const report = completion.params.find((param): param is string => typeof param === "string" && param.includes("notFoundScores"));
  expect(JSON.parse(report!)).toEqual({ notFoundScores: missing });
});

it("completes the session before enrichment runs, then keeps the fetch open until enrichment settles", async () => {
  let release!: () => void;
  let statusesWhenEnriching: unknown[] = [];
  const enrich = vi.fn(async () => {
    statusesWhenEnriching = sessionStatuses();
    await new Promise<void>(resolve => { release = resolve; });
  });
  state.fetch.mockResolvedValueOnce({ result: fetched, enrich });
  const started = await startScoreFetch(start);
  let settled = false;
  void started.backgroundWork!.then(() => { settled = true; });
  await vi.waitFor(() => expect(enrich).toHaveBeenCalledOnce());
  expect(enrich).toHaveBeenCalledWith(persisted);
  expect(statusesWhenEnriching).toEqual(["completed"]);
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  release();
  await started.backgroundWork;
  expect(settled).toBe(true);
});

it("keeps a saved snapshot's session completed when enrichment fails", async () => {
  state.fetch.mockResolvedValueOnce({ result: fetched, enrich: async () => { throw new Error("detail page changed"); } });
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  expect(sessionStatuses()).toEqual(["completed"]);
  expect(state.log.error).toHaveBeenCalledExactlyOnceWith({ err: new Error("detail page changed"), stepType: "enrich" }, "Score fetch enrichment failed");
});

it("logs a failed stage once with its step and stores the stage's own message", async () => {
  const failure = new Error("SUBSCRIPTION_REQUIRED: CHUNITHM-NET subscription required");
  state.fetch.mockRejectedValueOnce(new FetchStageError("song_data:master", 120, failure));
  const started = await startScoreFetch(start);
  await started.backgroundWork;
  expect(state.log.error).toHaveBeenCalledExactlyOnceWith({ err: failure, stepType: "song_data:master", durationMs: 120 }, "Error during score fetch");
  const [failed] = sessionUpdates();
  expect(failed.params).toEqual(expect.arrayContaining(["failed", failure.message]));
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
  expect(state.persist).not.toHaveBeenCalled();
  expect(sessionStatuses()).toEqual(["failed"]);
});

it("keeps CHUNITHM subscription failures scoped to the failed session without deleting credentials or writing a snapshot", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "jp");
  state.fetch.mockRejectedValueOnce(new Error("SUBSCRIPTION_REQUIRED: CHUNITHM-NET subscription required"));
  const started = await startScoreFetch({ ...start, game: "chunithm", token: undefined });
  await started.backgroundWork;
  expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ game: "chunithm", region: "jp", token: "stored-token" }), expect.anything());
  expect(state.fetch.mock.calls[0][0].signal.aborted).toBe(true);
  expect(state.persist).not.toHaveBeenCalled();
  expect(state.statements.some(query => query.sql.startsWith("delete") || query.sql.startsWith('update "user_tokens"'))).toBe(false);
  expect(sessionStatuses()).toEqual(["failed"]);
});

it("reads the unmatched scores a session stored", async () => {
  state.latestSession = [["public", "completed", "2026-09-27 02:59:00", "2026-09-27 03:00:00", null, "login", { notFoundScores: missing }]];
  await expect(getScoreFetchStatus({ userId: "same-user", game: "maimai", region: "jp" })).resolves.toEqual({
    id: "public",
    status: "completed",
    startedAt: new Date("2026-09-27T02:59:00Z"),
    completedAt: new Date("2026-09-27T03:00:00Z"),
    errorMessage: null,
    statusStates: "login",
    notFoundScores: missing,
  });
});

it.each([
  { row: "an invalid report", extraData: { notFoundScores: [{ songName: 1 }] } },
  { row: "a JSON string report of code keys from before the codes", extraData: JSON.stringify({ notFoundScores: [{ songName: "Missing", difficulty: "master", musicType: "std" }] }) },
])("reads no unmatched scores from a session with $row", async ({ extraData }) => {
  state.latestSession = [["public", "completed", "2026-09-27 02:59:00", "2026-09-27 03:00:00", null, "login", extraData]];
  await expect(getScoreFetchStatus({ userId: "same-user", game: "maimai", region: "jp" })).resolves.toMatchObject({ notFoundScores: null });
});
