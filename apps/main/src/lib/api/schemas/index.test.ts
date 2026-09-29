import { describe, expect, it } from "vitest";
import type { RecentPlay } from "@/server/queries/recents";
import { GAME_API_DETAILS, recentPlay, snapshotMetadata } from ".";

const JUDGMENT_COLUMNS = ["tap", "hold", "slide", "touch", "break"].flatMap(kind =>
  ["CPerfect", "Perfect", "Great", "Good", "Miss"].map(judgment => `${kind}${judgment}`));

function play(overrides: Partial<RecentPlay> = {}): RecentPlay {
  return {
    recentSongId: BigInt(1), playedAt: new Date("2026-09-01T00:00:00Z"), scoreValue: 1005000, secondaryScore: 2000,
    comboStatus: 3, syncStatus: 0, clearStatus: 0, maxDxScore: 2100, track: 1,
    songId: "Ab3xK9pQ:j13", songName: "Song", artist: "Artist", cover: "", metadata: null,
    difficultyCode: 3, typeCode: 1, level: "14", levelPrecise: 140, genre: "maimai",
    fastCount: null, lateCount: null, combo: null, maxCombo: null, syncScore: null, maxSyncScore: null,
    rating: null, ratingChange: null, venue: null, chunithmDetails: null,
    ...Object.fromEntries(JUDGMENT_COLUMNS.map(column => [column, null])),
    ...overrides,
  } as RecentPlay;
}

const detailed = {
  fastCount: 3, lateCount: 4, combo: 500, maxCombo: 500, syncScore: null, maxSyncScore: null, rating: 15000, ratingChange: 12, venue: "Arcade",
  ...Object.fromEntries(JUDGMENT_COLUMNS.map((column, index) => [column, index])),
} as Partial<RecentPlay>;

const chunithmPlaylog = {
  maxCombo: 1425,
  judgments: { justiceCritical: 1400, justice: 20, attack: 5, miss: 0 },
  notePercentages: { tap: 101, hold: 101, slide: 100.5, air: 101, flick: 100 },
};

describe("game details", () => {
  it("gives a maimai play its max DX score and, with the detailed scope, its stored playlog", () => {
    const withPlaylog = GAME_API_DETAILS.maimai.recent(play(detailed), true);
    expect(withPlaylog).toMatchObject({
      game: "maimai",
      maxDxScore: 2100,
      playlog: { venue: "Arcade", combo: 500, rating: 15000, ratingChange: 12, fast: 3, late: 4, notes: { tap: { cPerfect: 0, miss: 4 }, break: { miss: 24 } } },
    });
    expect(recentPlay.shape.details.parse(withPlaylog)).toStrictEqual(withPlaylog);

    expect(GAME_API_DETAILS.maimai.recent(play(detailed), false)).toStrictEqual({ game: "maimai", maxDxScore: 2100, playlog: null });
    expect(GAME_API_DETAILS.maimai.recent(play(), true)).toStrictEqual({ game: "maimai", maxDxScore: 2100, playlog: null });
  });

  it("gives a CHUNITHM play its decoded playlog only with the detailed scope", () => {
    const stored = play({ chunithmDetails: chunithmPlaylog });
    const withPlaylog = GAME_API_DETAILS.chunithm.recent(stored, true);
    expect(withPlaylog).toStrictEqual({ game: "chunithm", playlog: chunithmPlaylog });
    expect(recentPlay.shape.details.parse(withPlaylog)).toStrictEqual(withPlaylog);
    expect(GAME_API_DETAILS.chunithm.recent(stored, false)).toStrictEqual({ game: "chunithm", playlog: null });
  });

  it("keeps maimai's course, class and stars in its snapshot details", () => {
    const ranks = { courseRankUrl: "course.png", classRankUrl: null, stars: 3 };
    expect(GAME_API_DETAILS.maimai.snapshot(ranks)).toStrictEqual({ game: "maimai", ...ranks });
    expect(GAME_API_DETAILS.chunithm.snapshot()).toStrictEqual({ game: "chunithm" });
    expect(() => snapshotMetadata.shape.details.parse({ game: "maimai" })).toThrow();
  });
});
