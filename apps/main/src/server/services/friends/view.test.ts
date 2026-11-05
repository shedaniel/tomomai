import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
const mocks = vi.hoisted(() => ({ findFriends: vi.fn(), querySongScoresOf: vi.fn() }));
vi.mock("./queries", () => ({ findFriends: mocks.findFriends }));
vi.mock("@/server/queries/songs", () => ({ querySongScoresOf: mocks.querySongScoresOf }));
vi.mock("@/server/queries/latest-snapshot", () => ({ latestSnapshot: vi.fn() }));

import { friendSongScores } from "./view";

const SONG = { songName: "Song", type: "dx" };
const OPEN = {
  username: "open", name: "Open", image: null, publishProfile: true, profileShareWithFriends: false,
  profileShowAllScores: true, profileShowScoreDetails: true, mainRegion: null,
};

function score(userId: string, region: string, difficulty = "master") {
  return { userId, region, displayName: userId.toUpperCase(), iconUrl: "icon", difficulty, scoreValue: 1005000, comboStatus: 2, syncStatus: 1, clearStatus: 1 };
}

beforeEach(() => {
  proxy.reset();
  mocks.findFriends.mockReset();
  mocks.querySongScoresOf.mockReset().mockResolvedValue([]);
});

it("reads no scores without friends", async () => {
  mocks.findFriends.mockResolvedValue(new Map());
  await expect(friendSongScores("maimai", "me", SONG)).resolves.toEqual([]);
  expect(mocks.querySongScoresOf).not.toHaveBeenCalled();
});

it("reads only friends whose profile the viewer may open and who share every score", async () => {
  mocks.findFriends.mockResolvedValue(new Map([["open", ["jp"]], ["shared", ["jp"]], ["private", ["jp"]], ["best-only", ["jp"]]]));
  proxy.respond([
    { ...OPEN, userId: "open" },
    { ...OPEN, userId: "shared", username: "shared", publishProfile: false, profileShareWithFriends: true },
    { ...OPEN, userId: "private", username: "private", publishProfile: false },
    { ...OPEN, userId: "best-only", username: "best-only", profileShowAllScores: false },
  ]);
  await friendSongScores("maimai", "me", SONG);
  expect(mocks.querySongScoresOf).toHaveBeenCalledWith({ ...SONG, game: "maimai", userIds: ["open", "shared"] });
});

it("keeps only regions the two are friends in, and clears statuses a friend does not share", async () => {
  mocks.findFriends.mockResolvedValue(new Map([["open", ["jp"]], ["quiet", ["intl"]]]));
  proxy.respond([
    { ...OPEN, userId: "open" },
    { ...OPEN, userId: "quiet", username: "quiet", profileShowScoreDetails: false },
  ]);
  mocks.querySongScoresOf.mockResolvedValue([score("open", "jp"), score("open", "intl"), score("open", "jp", "expert"), score("quiet", "intl")]);

  const friends = await friendSongScores("maimai", "me", SONG);
  expect(friends).toEqual([
    {
      username: "open", name: "Open", image: null, region: "jp", displayName: "OPEN", iconUrl: "icon",
      scores: {
        master: { scoreValue: 1005000, comboStatus: 2, syncStatus: 1, clearStatus: 1 },
        expert: { scoreValue: 1005000, comboStatus: 2, syncStatus: 1, clearStatus: 1 },
      },
    },
    {
      username: "quiet", name: "Open", image: null, region: "intl", displayName: "QUIET", iconUrl: "icon",
      scores: { master: { scoreValue: 1005000, comboStatus: 0, syncStatus: 0, clearStatus: 0 } },
    },
  ]);
});
