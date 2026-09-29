import { beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  records: vi.fn(), progress: vi.fn(), remove: vi.fn(),
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child() { return this; } },
}));
vi.mock("../divingfish/client", async importOriginal => ({
  ...await importOriginal<typeof import("../divingfish/client")>(), fetchDivingFishRecordsByDevToken: mocks.records,
}));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("@/server/services/games/tokens", () => ({ deleteToken: mocks.remove }));

import { createFetchRun } from "@/server/services/games/fetch-run";
import type { ScoreFetchContext } from "@/server/services/games/types";
import { DivingFishUserNotFoundError } from "../divingfish/client";
import { fetchFromDivingFish } from "./divingfish";

const ctx: ScoreFetchContext = {
  game: "maimai", userId: "user", region: "cn", token: "divingfish://qq:://1", sessionId: BigInt(1), gameVersion: 14,
  flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal,
};
const token = { provider: "divingfish", account: { kind: "qq", value: "1" } } as const;

beforeEach(() => vi.clearAllMocks());

it("reads the account's player and best scores", async () => {
  mocks.records.mockResolvedValueOnce({
    nickname: "Player", rating: 15000,
    records: [{ title: "Song", level: "13", type: "DX", level_index: 2, achievements: 100, dxScore: 1 }],
  });
  const { result } = await fetchFromDivingFish(ctx, token, createFetchRun(ctx));
  expect(mocks.records).toHaveBeenCalledWith(token.account, ctx.signal);
  expect(result).toMatchObject({ player: { displayName: "Player", rating: 15000 }, recents: [], events: [] });
  expect(result.scores.map(score => score.chart)).toEqual([{ game: "maimai", region: "cn", version: 14, songName: "Song", chartType: 1, difficulty: 2 }]);
  expect(mocks.progress.mock.calls.map(([, state]) => state)).toEqual(["login", "player_data"]);
});

it("deletes a token for an account diving-fish no longer shows", async () => {
  mocks.records.mockRejectedValueOnce(new DivingFishUserNotFoundError("diving-fish user not found: no such user"));
  await expect(fetchFromDivingFish(ctx, token, createFetchRun(ctx))).rejects.toThrow("Session expired or invalid. Please provide a new token.");
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "user", "cn");
  expect(mocks.progress).not.toHaveBeenCalled();
});
