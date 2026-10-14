import { beforeEach, expect, it, vi } from "vitest";
import type { GameFetchResult, NormalizedScore } from "./types";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const state = vi.hoisted(() => ({
  resolveCharts: vi.fn(),
  writeScores: vi.fn(),
  log: { warn: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("./score-storage", async importOriginal => ({
  ...await importOriginal<typeof import("./score-storage")>(),
  buildChartResolution: state.resolveCharts,
  writeSnapshotScores: state.writeScores,
}));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => state.log }));

import { chartKey } from "./score-storage";
import { persistFetchResult } from "./snapshot-persistence";

const fetched: GameFetchResult = {
  player: { displayName: "Player", rating: 10000, title: "Title", titleType: 0, iconUrl: "", totalPlayCount: 1, currentVersionPlayCount: 1 },
  scores: [],
};
const persist = { userId: "same-user", game: "maimai" as const, region: "jp" as const, gameVersion: 14, fetched };

function score(chart: NormalizedScore["chart"], scoreValue = 0): NormalizedScore {
  return { chart, scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  proxy.answer(({ sql }) => sql.startsWith('insert into "user_snapshots"') ? [{ id: 1 }] : undefined);
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map(), songsById: new Map() });
  state.writeScores.mockResolvedValue(null);
});

it("persists the captured version and zero scores, and returns the snapshot's context for enrichment", async () => {
  const chart = { game: "maimai" as const, region: "jp" as const, version: 14, songName: "Zero", chartType: 0, difficulty: 3 };
  const song = { id: BigInt(7), addedVersion: 14, levelPrecise: 140, difficulty: 3 };
  const chartResolution = new Map([[chartKey(chart), BigInt(7)]]);
  state.resolveCharts.mockResolvedValue({ chartResolution, songsById: new Map([[BigInt(7), song]]) });
  const persisted = await persistFetchResult({ ...persist, fetched: { ...fetched, scores: [score(chart)] } });
  expect(state.writeScores).toHaveBeenCalledWith(expect.anything(), { game: "maimai", snapshotId: 1, gameVersion: 14, scores: [
    { song, values: { songId: BigInt(7), scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 } },
  ] });
  expect(proxy.inserted("user_snapshots")).toEqual([expect.objectContaining({ game: "maimai", gameVersion: 14 })]);
  expect(persisted).toEqual({
    context: { game: "maimai", userId: "same-user", region: "jp", snapshotId: 1, gameVersion: 14, chartResolution },
    notFoundScores: [],
  });
  expect(state.log.warn).not.toHaveBeenCalled();
});

it.each([
  { game: "maimai", difficulty: 3, chartType: 1 },
  { game: "chunithm", difficulty: 4, chartType: 0 },
] as const)("returns unmatched $game charts by their codes and logs them once", async ({ game, difficulty, chartType }) => {
  const chart = { game, region: "jp" as const, version: 9, songName: "Missing", chartType, difficulty };
  const { notFoundScores } = await persistFetchResult({ ...persist, game, gameVersion: 9, fetched: { ...fetched, scores: [score(chart, 1)] } });
  expect(notFoundScores).toEqual([{ songName: "Missing", difficulty, type: chartType }]);
  expect(state.log.warn).toHaveBeenCalledExactlyOnceWith(
    { count: 1, songKeys: [chartKey(chart)], game, region: "jp", version: 9 },
    "Some scores have no unambiguous catalog match",
  );
  expect(proxy.queries.some(query => query.table === "fetch_sessions")).toBe(false);
});

it("persists events against the new snapshot and game", async () => {
  const event = {
    name: "Progress", eventType: "area", currentDistance: 10, nextRewardDistance: null, state: "in_progress",
    imageUrl: "https://example.com/area.png", eventPeriodStart: null, eventPeriodEnd: null,
  } as const;
  await persistFetchResult({ ...persist, fetched: { ...fetched, events: [event] } });
  expect(proxy.inserted("user_events")).toEqual([{ ...event, snapshotId: 1, game: "maimai" }]);
});

it("persists recent plays with their track and maximum secondary score", async () => {
  const chart = { game: "maimai" as const, region: "jp" as const, version: 14, songName: "Recent", chartType: 1, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([[chartKey(chart), BigInt(7)]]), songsById: new Map() });
  const recent = { ...score(chart, 1005000), secondaryScore: 2100, playedAt: new Date("2026-09-01T00:00:00Z"), track: 3, maxSecondaryScore: 2400 };
  await persistFetchResult({ ...persist, fetched: { ...fetched, recents: [recent] } });
  expect(proxy.inserted("user_recent_songs")).toEqual([expect.objectContaining({
    game: "maimai", userId: "same-user", songId: BigInt(7), scoreValue: 1005000, secondaryScore: 2100, maxSecondaryScore: 2400, track: 3,
  })]);
});

it("rejects an expired persistence deadline before writing", async () => {
  await expect(persistFetchResult({ ...persist, deadline: Date.now() - 1 })).rejects.toThrow("timed out");
  expect(proxy.queries).toEqual([]);
});

it("persists CHUNITHM charts only in their captured game, region and version", async () => {
  const chart = { game: "chunithm" as const, region: "jp" as const, version: 9, songName: "Raw　Title", chartType: 0, difficulty: 3 };
  const matched = { ...score(chart, 1009000), comboStatus: 1, clearStatus: 1 };
  const song = { id: BigInt(7), addedVersion: 9, levelPrecise: 140, difficulty: 3 };
  state.resolveCharts.mockResolvedValue({ chartResolution: new Map([[chartKey(chart), BigInt(7)]]), songsById: new Map([[BigInt(7), song]]) });
  const { notFoundScores } = await persistFetchResult({ ...persist, game: "chunithm", gameVersion: 9, fetched: { ...fetched, scores: [
    matched,
    { ...matched, chart: { ...chart, game: "maimai" } },
    { ...matched, chart: { ...chart, region: "intl" } },
    { ...matched, chart: { ...chart, version: 8 } },
  ] } });
  expect(state.resolveCharts).toHaveBeenCalledWith(expect.anything(), "chunithm", "jp", 9);
  expect(state.writeScores).toHaveBeenCalledWith(expect.anything(), { game: "chunithm", snapshotId: 1, gameVersion: 9, scores: [
    { song, values: { songId: BigInt(7), scoreValue: 1009000, secondaryScore: 0, comboStatus: 1, syncStatus: 0, clearStatus: 1 } },
  ] });
  expect(notFoundScores).toHaveLength(3);
  expect(proxy.inserted("user_snapshots")).toEqual([expect.objectContaining({ game: "chunithm", region: "jp", gameVersion: 9 })]);
});
