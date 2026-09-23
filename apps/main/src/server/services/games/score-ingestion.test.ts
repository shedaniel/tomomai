import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import type { CanonicalGameId, GameFetchResult, ScoreAdapter } from "@/lib/games/types";
import { getCurrentVersion } from "@/lib/games/versions";

const testState = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state: {
    tables: Record<string, unknown> | null;
    songs: Row[];
    snapshots: Row[];
    scoreData: Row[];
    snapshotScores: Row[];
    snapshotRankings: Row[];
    sessions: Row[];
    tokens: Row[];
    users: Row[];
    optionalRows: Row[];
    nextSnapshotId: number;
    nextScoreId: number;
    activeSessionId: bigint;
    tokenConflictUpdates: number;
  } = {
    tables: null,
    songs: [],
    snapshots: [],
    scoreData: [],
    snapshotScores: [],
    snapshotRankings: [],
    sessions: [],
    tokens: [],
    users: [],
    optionalRows: [],
    nextSnapshotId: 1,
    nextScoreId: 1,
    activeSessionId: BigInt(1),
    tokenConflictUpdates: 0,
  };

  function table(name: string): unknown {
    return state.tables?.[name];
  }

  function query(rows: Row[]) {
    let currentRows = rows;
    const result = {
      innerJoin() { return result; },
      where() {
        return result;
      },
      orderBy() {
        return result;
      },
      limit(limit: number) {
        currentRows = currentRows.slice(0, limit);
        return result;
      },
      then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(currentRows).then(resolve, reject);
      },
    };
    return result;
  }

  function insertRows(target: unknown, values: Row[]): Row[] {
    if (target === table("userSnapshots")) {
      const inserted = values.map(value => ({ ...value, id: state.nextSnapshotId++ }));
      state.snapshots.push(...inserted);
      return inserted;
    }

    if (target === table("scoreData")) {
      return values.map(value => {
        const existing = state.scoreData.find(row =>
          row.songId === value.songId
          && row.scoreValue === value.scoreValue
          && row.secondaryScore === value.secondaryScore
          && row.comboStatus === value.comboStatus
          && row.syncStatus === value.syncStatus
          && row.clearStatus === value.clearStatus,
        );
        if (existing) return existing;
        const inserted = { ...value, id: state.nextScoreId++ };
        state.scoreData.push(inserted);
        return inserted;
      });
    }

    if (target === table("snapshotScores")) {
      for (const value of values) {
        if (!state.snapshotScores.some(row => row.snapshotId === value.snapshotId && row.scoreId === value.scoreId)) {
          state.snapshotScores.push({ ...value });
        }
      }
      return values;
    }

    if (target === table("snapshotRankings")) {
      for (const value of values) {
        if (!state.snapshotRankings.some(row =>
          row.snapshotId === value.snapshotId && row.bucket === value.bucket && row.rank === value.rank,
        )) {
          state.snapshotRankings.push({ ...value });
        }
      }
      return values;
    }

    if (target === table("fetchSessions")) {
      const inserted = values.map(value => ({ ...value, id: BigInt(state.sessions.length + 1) }));
      state.sessions.push(...inserted);
      return inserted;
    }

    if (target === table("userTokens")) {
      const inserted = values.map(value => ({ ...value }));
      state.tokens.push(...inserted);
      return inserted;
    }

    state.optionalRows.push(...values);
    return values;
  }

  function insert(target: unknown) {
    return {
      values(values: Row | Row[]) {
        const normalized = Array.isArray(values) ? values : [values];
        let inserted: Row[] | undefined;
        const execute = () => inserted ??= insertRows(target, normalized);
        return {
          onConflictDoUpdate(config: { set?: Row }) {
            let upserted: Row[] | undefined;
            const executeUpsert = () => upserted ??= target === table("userTokens")
              ? normalized.map(value => {
                  const existing = state.tokens.find(row =>
                    row.userId === value.userId
                    && row.game === value.game
                    && row.region === value.region,
                  );
                  if (!existing) return insertRows(target, [value])[0];
                  Object.assign(existing, config.set);
                  state.tokenConflictUpdates++;
                  return existing;
                })
              : execute();
            return {
              returning: async () => executeUpsert(),
              then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
                return Promise.resolve(executeUpsert()).then(resolve, reject);
              },
            };
          },
          onConflictDoNothing() {
            return {
              then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
                return Promise.resolve(execute()).then(resolve, reject);
              },
            };
          },
          returning: async () => execute(),
          then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve(execute()).then(resolve, reject);
          },
        };
      },
    };
  }

  const db = {
    execute: vi.fn(),
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const backup = structuredClone({ snapshots: state.snapshots, scoreData: state.scoreData, snapshotScores: state.snapshotScores, snapshotRankings: state.snapshotRankings });
      try { return await work(db); } catch (error) { Object.assign(state, backup); throw error; }
    },
    query: {
      songs: {
        findMany: async () => state.songs,
      },
    },
    select(selection?: Record<string, unknown>) {
      return {
        from(target: unknown) {
          if (target === table("songs")) return query(state.songs);
          if (target === table("userTokens")) return query(state.tokens);
          if (target === table("user")) return query(state.users);
          if (target === table("fetchSessions")) return query(state.sessions);
          void selection;
          return query([]);
        },
      };
    },
    insert,
    update(target: unknown) {
      return {
        set(values: Row) {
          return {
            async where() {
              if (target === table("fetchSessions")) {
                const session = state.sessions.find(row => row.id === state.activeSessionId);
                if (session) Object.assign(session, values);
              }
            },
          };
        },
      };
    },
  };

  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: testState.db }));
vi.mock("@/lib/profile-cache", () => ({
  revalidatePublicProfileForUser: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/request-logger", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/token-crypto", () => ({
  encryptToken: (token: string) => `encrypted:${token}`,
  decryptToken: (token: string) => token.replace(/^encrypted:/, ""),
}));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import * as schema from "@/lib/db/schema-pg";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { revalidatePublicProfileForUser } from "@/lib/profile-cache";
import { persistFetchResult, startScoreFetch } from "./score-ingestion";

testState.state.tables = schema as unknown as Record<string, unknown>;

function createPlayer() {
  return {
    displayName: "Test Player",
    rating: 12345,
    title: "Test Title",
    titleType: 0,
    iconUrl: "https://example.test/icon.png",
    totalPlayCount: 100,
    currentVersionPlayCount: 20,
    courseRankUrl: undefined,
    classRankUrl: undefined,
    stars: 3,
  };
}

function createScore(
  game: CanonicalGameId,
  region: "intl" | "jp" | "cn",
  version: number,
  songName: string,
  values: Partial<GameFetchResult["scores"][number]> = {},
) {
  return {
    chart: {
      game,
      region,
      version,
      songName,
      chartType: 0,
      difficulty: 0,
    },
    scoreValue: 990000,
    secondaryScore: 100,
    comboStatus: 1,
    syncStatus: 1,
    clearStatus: 0,
    ...values,
  };
}

function createFetched(scores: GameFetchResult["scores"]): GameFetchResult {
  return {
    player: createPlayer(),
    scores,
  };
}

function createSong(game: CanonicalGameId, gameVersion: number, id: number, songName: string) {
  return {
    id: BigInt(id),
    publicId: `song-${game}-${id}`,
    game,
    songName,
    artist: "Test Artist",
    cover: "https://example.test/cover.png",
    difficulty: 0,
    level: "12",
    levelPrecise: 120,
    type: 0,
    genre: "Test Genre",
    region: "intl" as const,
    gameVersion,
    addedVersion: gameVersion,
    bpm: null,
    noteDesigner: null,
    tapCount: null,
    holdCount: null,
    slideCount: null,
    touchCount: null,
    breakCount: null,
  };
}

describe("score ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.state.songs = [];
    testState.state.snapshots = [];
    testState.state.scoreData = [];
    testState.state.snapshotScores = [];
    testState.state.snapshotRankings = [];
    testState.state.sessions = [];
    testState.state.tokens = [];
    testState.state.users = [];
    testState.state.optionalRows = [];
    testState.state.nextSnapshotId = 1;
    testState.state.nextScoreId = 1;
    testState.state.activeSessionId = BigInt(1);
    testState.state.tokenConflictUpdates = 0;
  });

  it("creates a snapshot, resolves charts, deduplicates scores, records misses, and ranks through the game adapter", async () => {
    const gameVersion = getCurrentVersion("maimai", "intl");
    testState.state.songs = [createSong("maimai", gameVersion, 101, "Hit Song")];
    testState.state.sessions = [
      { id: BigInt(1), game: "maimai", region: "intl", extraData: null },
    ];

    const calculateRating = vi.spyOn(GAME_REGISTRY.maimai.adapter, "calculateChartRating");
    const selectRankings = vi.spyOn(GAME_REGISTRY.maimai.adapter, "selectRankings");
    let persistedContext: unknown;

    const result = await persistFetchResult({
      game: "maimai",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(1),
      gameVersion,
      fetched: createFetched([
        createScore("maimai", "intl", gameVersion, "Hit Song"),
        createScore("maimai", "intl", gameVersion, "Hit Song"),
        createScore("maimai", "intl", gameVersion, "Missing Song"),
      ]),
      persistExtra: async context => {
        persistedContext = context;
      },
    });

    expect(result).toEqual({ snapshotId: 1 });
    expect(testState.state.snapshots).toHaveLength(1);
    expect(testState.state.snapshots[0]).toMatchObject({
      game: "maimai",
      region: "intl",
      gameVersion,
      iconUrl: "https://example.test/icon.png",
      versionPlayCount: 20,
    });
    expect(testState.state.scoreData).toHaveLength(1);
    expect(testState.state.snapshotScores).toEqual([
      { game: "maimai", snapshotId: 1, scoreId: 1 },
    ]);
    expect(testState.state.snapshotRankings).toHaveLength(1);
    expect(testState.state.snapshotRankings[0]).toMatchObject({
      game: "maimai",
      snapshotId: 1,
      bucket: 1,
      rank: 0,
      scoreId: 1,
    });
    expect(testState.state.sessions[0].extraData).toEqual(JSON.stringify({
      notFoundScores: [{ songName: "Missing Song", difficulty: "basic", musicType: "std" }],
    }));
    expect(calculateRating).toHaveBeenCalledTimes(1);
    expect(selectRankings).toHaveBeenCalledTimes(1);
    expect(persistedContext).toMatchObject({
      userId: "user-1",
      sessionId: BigInt(1),
      snapshotId: 1,
      gameVersion,
    });
    expect((persistedContext as { chartResolution: Map<string, bigint> }).chartResolution.get("Hit Song|0|0"))
      .toBe(BigInt(101));
  });

  it("persists zero-valued compact score fields", async () => {
    const gameVersion = getCurrentVersion("maimai", "intl");
    testState.state.songs = [createSong("maimai", gameVersion, 102, "Zero Song")];
    testState.state.sessions = [{ id: BigInt(2), game: "maimai", region: "intl", extraData: null }];
    testState.state.activeSessionId = BigInt(2);

    await persistFetchResult({
      game: "maimai",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(2),
      gameVersion,
      fetched: createFetched([
        createScore("maimai", "intl", gameVersion, "Zero Song", {
          scoreValue: 0,
          secondaryScore: 0,
          comboStatus: 0,
          syncStatus: 0,
          clearStatus: 0,
        }),
      ]),
    });

    expect(testState.state.scoreData).toEqual([expect.objectContaining({
      game: "maimai",
      songId: BigInt(102),
      scoreValue: 0,
      secondaryScore: 0,
      comboStatus: 0,
      syncStatus: 0,
      clearStatus: 0,
    })]);
  });

  it("keeps snapshots and score rows isolated across games", async () => {
    const maimaiVersion = getCurrentVersion("maimai", "intl");
    const chunithmVersion = getCurrentVersion("chunithm", "intl");
    const maimaiSong = createSong("maimai", maimaiVersion, 201, "Shared Song");
    const chunithmSong = { ...createSong("chunithm", chunithmVersion, 202, "Shared Song"), game: "chunithm" as const };

    testState.state.sessions = [
      { id: BigInt(11), game: "maimai", region: "intl", extraData: null },
      { id: BigInt(12), game: "chunithm", region: "intl", extraData: null },
    ];
    testState.state.songs = [maimaiSong];
    await persistFetchResult({
      game: "maimai",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(11),
      gameVersion: maimaiVersion,
      fetched: createFetched([createScore("maimai", "intl", maimaiVersion, "Shared Song")]),
    });

    testState.state.songs = [chunithmSong];
    testState.state.activeSessionId = BigInt(12);
    await persistFetchResult({
      game: "chunithm",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(12),
      gameVersion: chunithmVersion,
      fetched: createFetched([createScore("chunithm", "intl", chunithmVersion, "Shared Song")]),
    });

    expect(testState.state.snapshots.map(row => row.game)).toEqual(["maimai", "chunithm"]);
    expect(testState.state.scoreData.map(row => [row.game, row.songId])).toEqual([
      ["maimai", BigInt(201)],
      ["chunithm", BigInt(202)],
    ]);
    expect(testState.state.snapshotScores.map(row => row.game)).toEqual(["maimai", "chunithm"]);
    expect(testState.state.snapshotRankings.map(row => row.game)).toEqual(["maimai", "chunithm"]);
  });

  it("persists the game version captured at fetch start", async () => {
    const capturedVersion = getCurrentVersion("maimai", "intl") + 1;
    testState.state.songs = [createSong("maimai", capturedVersion, 301, "Rollover Song")];

    await persistFetchResult({
      game: "maimai",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(21),
      gameVersion: capturedVersion,
      fetched: createFetched([
        createScore("maimai", "intl", capturedVersion, "Rollover Song"),
      ]),
    });

    expect(testState.state.snapshots[0]).toMatchObject({ gameVersion: capturedVersion });
    expect(testState.state.scoreData).toEqual([
      expect.objectContaining({ songId: BigInt(301) }),
    ]);
  });

  it("persists adapter extras before revalidating the profile", async () => {
    const gameVersion = getCurrentVersion("maimai", "intl");
    const order: string[] = [];
    vi.mocked(revalidatePublicProfileForUser).mockImplementationOnce(async () => {
      order.push("revalidate");
    });

    await persistFetchResult({
      game: "maimai",
      region: "intl",
      userId: "user-1",
      sessionId: BigInt(22),
      gameVersion,
      fetched: createFetched([]),
      persistExtra: async () => {
        order.push("persistExtra");
      },
    });

    expect(order).toEqual(["persistExtra", "revalidate"]);
  });

  it("runs generic token validation synchronously using CN single-use tokens as an example", async () => {
    const previousMaimaiRegions = process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS;
    const validateToken = vi.fn<NonNullable<ScoreAdapter["validateToken"]>>(ctx => {
      if (ctx.token.startsWith("cn-cookies://") && !ctx.tokenProvided) {
        throw new Error("CN_COOKIES_SINGLE_USE: fresh authentication required");
      }
    });
    const fetch = vi.fn(async () => ({ result: createFetched([]) }));
    const adapter: ScoreAdapter = { configured: true, validateToken, fetch };

    try {
      process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS = "intl,jp,cn";
      testState.state.tokens = [{
        userId: "user-1",
        game: "maimai",
        region: "cn",
        token: "encrypted:cn-cookies://stored",
      }];

      await expect(startScoreFetch({
        userId: "user-1",
        game: "maimai",
        region: "cn",
        flags: {} as Flags,
        options: { skipAfter: true },
        scoreAdapter: adapter,
      })).rejects.toThrow("CN_COOKIES_SINGLE_USE");

      expect(testState.state.sessions).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      expect(validateToken).toHaveBeenLastCalledWith(expect.objectContaining({
        region: "cn",
        token: "cn-cookies://stored",
        tokenProvided: false,
      }));

      testState.state.tokens = [];
      testState.state.users = [{ id: "user-1", fetchUseAlbums: false }];
      const result = await startScoreFetch({
        userId: "user-1",
        game: "maimai",
        region: "cn",
        token: "cn-cookies://fresh",
        flags: {} as Flags,
        options: { skipAfter: true },
        scoreAdapter: adapter,
      });
      await result.backgroundWork;

      expect(validateToken).toHaveBeenLastCalledWith(expect.objectContaining({
        region: "cn",
        token: "cn-cookies://fresh",
        tokenProvided: true,
      }));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(testState.state.sessions).toMatchObject([{ status: "completed" }]);
    } finally {
      if (previousMaimaiRegions === undefined) delete process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS;
      else process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS = previousMaimaiRegions;
    }
  });

  it("updates only the matching game token on conflict", async () => {
    const adapter: ScoreAdapter = {
      configured: true,
      fetch: vi.fn(async () => ({ result: createFetched([]) })),
    };
    testState.state.users = [{ id: "user-1", fetchUseAlbums: false }];
    testState.state.tokens = [
      { userId: "user-1", game: "maimai", region: "intl", token: "encrypted:old" },
      { userId: "user-1", game: "chunithm", region: "intl", token: "encrypted:other" },
    ];

    const result = await startScoreFetch({
      userId: "user-1",
      game: "maimai",
      region: "intl",
      token: "new",
      flags: {} as Flags,
      options: { skipAfter: true },
      scoreAdapter: adapter,
    });
    await result.backgroundWork;

    expect(testState.state.tokenConflictUpdates).toBe(1);
    expect(testState.state.tokens).toEqual([
      expect.objectContaining({ game: "maimai", token: "encrypted:new" }),
      expect.objectContaining({ game: "chunithm", token: "encrypted:other" }),
    ]);
  });

  it("keeps token and fetch session lifecycles isolated across games", async () => {
    const previousMaimaiRegions = process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS;
    const previousChunithmRegions = process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS;
    const originalChunithmEnabled = GAME_REGISTRY.chunithm.enabled;
    const originalChunithmCapabilities = GAME_REGISTRY.chunithm.adapter.capabilities;
    const originalChunithmScores = GAME_REGISTRY.chunithm.adapter.scores;
    const fetch = vi.fn(async () => ({ result: createFetched([]) }));
    const adapter: ScoreAdapter = { configured: true, fetch };

    try {
      process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS = "intl";
      process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS = "intl";
      GAME_REGISTRY.chunithm.enabled = true;
      GAME_REGISTRY.chunithm.adapter.capabilities = new Set([
        ...originalChunithmCapabilities,
        "scores",
      ]);
      GAME_REGISTRY.chunithm.adapter.scores = adapter;
      testState.state.users = [{ id: "user-1", fetchUseAlbums: false }];

      const maimaiResult = await startScoreFetch({
        userId: "user-1",
        game: "maimai",
        region: "intl",
        token: "maimai-token",
        flags: {} as Flags,
        options: { skipAfter: true },
        scoreAdapter: adapter,
      });
      await maimaiResult.backgroundWork;
      expect(testState.state.sessions).toMatchObject([{ game: "maimai", status: "completed" }]);

      testState.state.sessions[0].startedAt = new Date(Date.now() - 4 * 60 * 1000);
      testState.state.activeSessionId = BigInt(2);
      const chunithmResult = await startScoreFetch({
        userId: "user-1",
        game: "chunithm",
        region: "intl",
        token: "chunithm-token",
        flags: {} as Flags,
        options: { skipAfter: true },
        scoreAdapter: adapter,
      });
      await chunithmResult.backgroundWork;

      expect(testState.state.tokens.map(row => [row.userId, row.game, row.region])).toEqual([
        ["user-1", "maimai", "intl"],
        ["user-1", "chunithm", "intl"],
      ]);
      expect(testState.state.sessions.map(row => [row.userId, row.game, row.region])).toEqual([
        ["user-1", "maimai", "intl"],
        ["user-1", "chunithm", "intl"],
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      GAME_REGISTRY.chunithm.enabled = originalChunithmEnabled;
      GAME_REGISTRY.chunithm.adapter.capabilities = originalChunithmCapabilities;
      GAME_REGISTRY.chunithm.adapter.scores = originalChunithmScores;
      if (previousMaimaiRegions === undefined) delete process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS;
      else process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS = previousMaimaiRegions;
      if (previousChunithmRegions === undefined) delete process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS;
      else process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS = previousChunithmRegions;
    }
  });
  it("leaves ambiguous parent identities unresolved", async () => {
    const gameVersion = getCurrentVersion("maimai", "intl");
    testState.state.songs = [createSong("maimai", gameVersion, 1, "Collision"), createSong("maimai", gameVersion, 2, "Collision")];
    await persistFetchResult({ game: "maimai", region: "intl", userId: "user-1", sessionId: BigInt(1), gameVersion,
      fetched: createFetched([createScore("maimai", "intl", gameVersion, "Collision")]),
    });
    expect(testState.state.scoreData).toHaveLength(0);
    expect(testState.state.snapshotScores).toHaveLength(0);
  });

  it("rolls back snapshot and score writes if ranking fails", async () => {
    const gameVersion = getCurrentVersion("maimai", "intl");
    testState.state.songs = [createSong("maimai", gameVersion, 1, "Hit")];
    const select = vi.spyOn(GAME_REGISTRY.maimai.adapter, "selectRankings").mockImplementationOnce(() => { throw new Error("ranking failure"); });
    try {
      await expect(persistFetchResult({ game: "maimai", region: "intl", userId: "user-1", sessionId: BigInt(1), gameVersion,
        fetched: createFetched([createScore("maimai", "intl", gameVersion, "Hit")]),
      })).rejects.toThrow("ranking failure");
      expect(testState.state.snapshots).toHaveLength(0);
      expect(testState.state.scoreData).toHaveLength(0);
      expect(testState.state.snapshotScores).toHaveLength(0);
    } finally { select.mockRestore(); }
  });

  it("rejects an expired persistence deadline before any writes", async () => {
    await expect(persistFetchResult({ game: "maimai", region: "intl", userId: "user-1", sessionId: BigInt(1),
      gameVersion: getCurrentVersion("maimai", "intl"), fetched: createFetched([]), deadline: Date.now() - 1,
    })).rejects.toThrow("timed out");
    expect(testState.state.snapshots).toHaveLength(0);
  });

  it("cannot persist a provider result arriving after its timeout", async () => {
    vi.useFakeTimers();
    let finish!: (value: { result: GameFetchResult }) => void;
    const pending = new Promise<{ result: GameFetchResult }>(resolve => { finish = resolve; });
    testState.state.users = [{ id: "user-1", fetchUseAlbums: false }];
    try {
      const started = await startScoreFetch({ userId: "user-1", game: "maimai", region: "intl", token: "test",
        flags: {} as Flags, options: { skipAfter: true }, scoreAdapter: { configured: true, fetch: () => pending },
      });
      await vi.advanceTimersByTimeAsync(120001);
      await started.backgroundWork;
      expect(testState.state.sessions[0].status).toBe("failed");
      finish({ result: createFetched([]) });
      await vi.advanceTimersByTimeAsync(1);
      expect(testState.state.snapshots).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it("stores generic optional payloads without maimai-only requirements", async () => {
    const gameVersion = getCurrentVersion("chunithm", "intl");
    testState.state.songs = [createSong("chunithm", gameVersion, 401, "Generic Chart")];
    const score = createScore("chunithm", "intl", gameVersion, "Generic Chart", { secondaryScore: 0, comboStatus: 0, syncStatus: 0 });
    const playedAt = new Date("2026-09-01T00:00:00Z");
    await persistFetchResult({ game: "chunithm", region: "intl", userId: "user-1", sessionId: BigInt(1), gameVersion,
      fetched: { ...createFetched([score]),
        player: { ...createPlayer(), metadata: { adapterVersion: 1 } },
        recents: [{ ...score, playedAt, details: { judgement: "complete" } }],
        events: [{ name: "Map progress", metadata: { steps: 10 } }],
        albums: [{ chart: score.chart, capturedAt: playedAt, metadata: { url: "https://example.test/image" } }],
      },
    });
    expect(testState.state.snapshots[0].metadata).toEqual({ adapterVersion: 1 });
    expect(testState.state.optionalRows).toEqual([
      expect.objectContaining({ game: "chunithm", scoreValue: score.scoreValue, maxDxScore: null, metadata: { judgement: "complete" } }),
      expect.objectContaining({ game: "chunithm", name: "Map progress", eventType: null, state: null, metadata: { steps: 10 } }),
      expect.objectContaining({ game: "chunithm", takenAt: playedAt, metadata: { url: "https://example.test/image" } }),
    ]);
  });

});
