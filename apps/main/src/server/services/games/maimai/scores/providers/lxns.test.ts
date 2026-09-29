import { beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), player: vi.fn(), scores: vi.fn(), progress: vi.fn(), remove: vi.fn(),
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child() { return this; } },
}));
vi.mock("../../login", () => ({ lxnsAccessToken: mocks.access }));
vi.mock("../player/lxns", async importOriginal => ({ ...await importOriginal<typeof import("../player/lxns")>(), fetchLxnsPlayerData: mocks.player }));
vi.mock("../songs/lxns", () => ({ fetchLxnsScoresData: mocks.scores }));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("@/server/services/games/tokens", () => ({ deleteToken: mocks.remove }));

import { createFetchRun } from "@/server/services/games/fetch-run";
import type { ScoreFetchContext } from "@/server/services/games/types";
import { LxnsAuthRevokedError } from "../player/lxns";
import type { PlayerData } from "../types";
import { fetchFromLxns } from "./lxns";

const ctx: ScoreFetchContext = {
  game: "maimai", userId: "user", region: "cn", token: "lxns://a:://r:://9:://read", sessionId: BigInt(1), gameVersion: 14,
  flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal,
};
const token = { provider: "lxns", accessToken: "a", refreshToken: "r", expiresAtMs: 9, scope: "read" } as const;
const player: PlayerData = {
  iconUrl: "", displayName: "Player", rating: 15000, title: "Title", titleType: "normal", stars: 0,
  versionPlayCount: 1, totalPlayCount: 2, courseRankUrl: "", classRankUrl: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue("access");
  mocks.player.mockResolvedValue(player);
  mocks.scores.mockResolvedValue([{ songName: "Song", level: "13", musicType: "dx", difficulty: "expert", achievement: 1_000_000, dxScore: 1, fc: "none", fs: "none" }]);
});

it("reads the player and best scores with the current access token", async () => {
  const { result, enrich } = await fetchFromLxns(ctx, token, createFetchRun(ctx));
  expect(mocks.access).toHaveBeenCalledWith("user", "cn", token, ctx.signal);
  expect(mocks.player).toHaveBeenCalledWith("access", ctx.signal);
  expect(mocks.scores).toHaveBeenCalledWith("access", ctx.signal);
  expect(result).toMatchObject({ player: { displayName: "Player" }, recents: [], events: [] });
  expect(result.scores.map(score => score.chart)).toEqual([{ game: "maimai", region: "cn", version: 14, songName: "Song", chartType: 1, difficulty: 2 }]);
  expect(mocks.progress.mock.calls.map(([, state]) => state)).toEqual(["login", "player_data"]);
  expect(enrich).toBeUndefined();
});

it("deletes a token lxns no longer authorizes and asks for a new one", async () => {
  mocks.scores.mockRejectedValueOnce(new LxnsAuthRevokedError("lxns authorization revoked or expired (HTTP 401)."));
  await expect(fetchFromLxns(ctx, token, createFetchRun(ctx))).rejects.toThrow("Session expired or invalid. Please provide a new token.");
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "user", "cn");
});
