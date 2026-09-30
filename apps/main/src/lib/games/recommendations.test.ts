import { describe, expect, it } from "vitest";
import { codeOf } from "./codes";
import type { GamePlayerScore, GameSnapshotData } from "./player-view";
import { generateRecommendations, type RecommendationPeers } from "./recommendations";
import type { CanonicalGameId } from "./types";

const song: GamePlayerScore = {
  songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
  addedVersion: 9, difficultyCode: 3, typeCode: 0, scoreValue: 1000000, secondaryScore: 0,
  comboStatus: 0, syncStatus: 0, clearStatus: 0,
};
const snapshot: GameSnapshotData["snapshot"] = {
  publicId: "snapshot", game: "chunithm", gameVersion: 9, displayName: "Player", rating: 30, fetchedAt: new Date(),
};
function recommend(songs: GamePlayerScore[], overrides: Partial<GameSnapshotData["snapshot"]> = {}, peers: Record<string, RecommendationPeers> = {}) {
  return generateRecommendations({ snapshot: { ...snapshot, ...overrides }, songs }, peers);
}
function difficulty(game: CanonicalGameId, key: string) {
  return codeOf(game, "difficulty", key);
}
const maimai = { game: "maimai", gameVersion: 13 } as const;
const AP = codeOf("maimai", "comboStatus", "ap");

describe("CHUNITHM recommendations", () => {
  it("targets grade thresholds with the floored average gain, and offers no combo target", () => {
    const recommendations = recommend([song]);
    expect(recommendations.map(rec => [rec.target.label, rec.target.scoreValue, rec.target.kind])).toEqual([
      ["SS+", 1005000, "score"], ["SSS", 1007500, "score"], ["SSS+", 1009000, "score"],
    ]);
    expect(recommendations[0]).toMatchObject({ song: { rating: 1500 }, targetRating: 1550, ratingGain: 1, category: "new", isInBest: true });
    expect(recommendations[2]).toMatchObject({ targetRating: 1615, ratingGain: 2 });
  });

  it("compares full new and old buckets against their own B20 and B30 cutoff", () => {
    const newBest = Array.from({ length: 20 }, (_, i) => ({ ...song, songId: `new-${i}`, scoreValue: 1007500 }));
    const oldBest = Array.from({ length: 30 }, (_, i) => ({ ...song, songId: `old-${i}`, scoreValue: 1005000, addedVersion: 8 }));
    const recommendations = recommend([...newBest, ...oldBest, song, { ...song, songId: "old-candidate", addedVersion: 8 }]);
    expect(recommendations.filter(rec => rec.song.songId === "chart")).toEqual([]);
    expect(recommendations.find(rec => rec.song.songId === "old-candidate"))
      .toMatchObject({ target: { label: "SSS" }, ratingGain: 1, isInBest: false, category: "old" });
  });

  it("adds a chart to a bucket that is not full and floors the average only after summing", () => {
    const recommendations = recommend([song, { ...song, songId: "other", chartRating: 1549 }]);
    expect(recommendations.find(rec => rec.song.songId === "chart")).toMatchObject({ target: { label: "SS+" }, ratingGain: 1 });
    expect(recommendations.find(rec => rec.song.songId === "chart" && rec.target.label === "SSS+")?.ratingGain).toBe(3);
  });

  it("leaves WORLD'S END charts out", () => {
    expect(recommend([{ ...song, difficultyCode: difficulty("chunithm", "worlds-end") }])).toEqual([]);
  });
});

describe("maimai recommendations", () => {
  it("counts the previous version's charts as new and offers AP only from CiRCLE", () => {
    const chart = { ...song, addedVersion: 12, scoreValue: 1005000, levelPrecise: 140 };
    expect(recommend([chart], maimai)).toMatchObject([{ target: { kind: "combo", label: "AP", scoreValue: 1005000 }, ratingGain: 1, category: "new" }]);
    expect(recommend([{ ...chart, comboStatus: AP }], maimai)).toEqual([]);
    expect(recommend([chart], { ...maimai, gameVersion: 11 })).toEqual([]);
  });

  it("leaves utage charts out", () => {
    expect(recommend([{ ...song, difficultyCode: difficulty("maimai", "utage"), scoreValue: 900000 }], maimai)).toEqual([]);
  });

  it("keeps the output for full B15 and B35 buckets", () => {
    const best = { ...song, levelPrecise: 130, addedVersion: 13, scoreValue: 1005000, comboStatus: AP };
    const songs = [
      ...Array.from({ length: 15 }, (_, i) => ({ ...best, songId: `new-${i}`, levelPrecise: 130 + i })),
      ...Array.from({ length: 35 }, (_, i) => ({ ...best, songId: `old-${i}`, addedVersion: 5, levelPrecise: 120 + (i % 10) })),
    ];
    songs[0] = { ...songs[0], scoreValue: 995000, comboStatus: 0 };
    songs[1] = { ...songs[1], comboStatus: 0 };
    songs[15] = { ...songs[15], scoreValue: 990000, comboStatus: 0 };
    songs.push({ ...best, songId: "new-candidate", levelPrecise: 125, scoreValue: 990000, comboStatus: 0 });
    songs.push({ ...best, songId: "old-candidate", addedVersion: 5, levelPrecise: 120, scoreValue: 980000, comboStatus: 0 });
    expect(recommend(songs, maimai).map(rec => [rec.song.songId, rec.target.label, rec.targetRating, rec.ratingGain, rec.isInBest])).toEqual([
      ["new-0", "SSS", 280, 8, true], ["old-0", "SS+", 251, 4, true], ["new-candidate", "SSS+", 281, 9, false],
      ["old-candidate", "SS+", 251, 4, false], ["new-1", "AP", 295, 1, true], ["new-0", "SSS+", 292, 20, true],
      ["old-0", "SSS", 259, 12, true], ["old-candidate", "SSS", 259, 12, false], ["new-candidate", "AP", 282, 10, false],
      ["old-0", "SSS+", 270, 23, true], ["old-candidate", "SSS+", 270, 23, false], ["new-0", "AP", 293, 21, true],
      ["old-0", "AP", 271, 24, true], ["old-candidate", "AP", 271, 24, false],
    ]);
  });
});

describe("peer evidence", () => {
  const chart = { ...song, songId: "a", typeCode: 1, scoreValue: 996440, levelPrecise: 136, addedVersion: 13 };
  function sss(peers: RecommendationPeers | undefined, songs = [chart]) {
    return recommend(songs, maimai, peers ? { a: peers } : {}).find(rec => rec.song.songId === "a" && rec.target.label === "SSS")!;
  }
  const shares = (share: number) => ({ 1000000: share });

  it("scales a score target's efficiency by how many peers reached it, more strongly the more peers there are", () => {
    const common = sss({ peerCount: 100, reachShares: shares(0.75) });
    expect(common.peerWeight).toBeCloseTo(16 ** (1 / 3), 6);
    expect(common).toMatchObject({ peerReach: 0.75, efficiencyScore: common.efficiency * common.peerWeight, hasPotential: true });
    expect(sss({ peerCount: 100, reachShares: shares(0.9) }).peerWeight).toBeGreaterThan(4);
    expect(sss({ peerCount: 100, reachShares: shares(0.1) }).peerWeight).toBeLessThan(0.25);
    expect(sss({ peerCount: 30, reachShares: shares(0.9) }).peerWeight).toBeLessThan(sss({ peerCount: 100, reachShares: shares(0.9) }).peerWeight);
    expect(sss({ peerCount: 100000, reachShares: shares(1) }).peerWeight).toBeLessThanOrEqual(16);
    expect(sss({ peerCount: 100000, reachShares: shares(0) }).peerWeight).toBeGreaterThanOrEqual(1 / 16);
  });

  it("keeps the base efficiency without enough evidence, for a combo target, and never promotes a small gain", () => {
    for (const peers of [undefined, { peerCount: 29, reachShares: shares(0.9) }, { peerCount: 100, reachShares: {} }]) {
      expect(sss(peers)).toMatchObject({ peerWeight: 1, peerReach: null, hasPotential: false });
    }
    const ap = recommend([chart], maimai, { a: { peerCount: 100, reachShares: { 1005000: 0.9 } } }).find(rec => rec.target.kind === "combo");
    expect(ap).toMatchObject({ efficiency: 2, efficiencyScore: 2, peerReach: null });
    const small = { ...chart, levelPrecise: 50, scoreValue: 994900 };
    const nearest = (share: number) => recommend([small], maimai, { a: { peerCount: 100, reachShares: { 995000: share } } })[0];
    expect(nearest(0.9)).toMatchObject({ target: { label: "SS+" }, targetRating: 104, peerWeight: 1 });
    expect(nearest(0.1).peerWeight).toBeLessThan(1);
  });

  it("ranks the chart its peers reach more often first", () => {
    const peers = { a: { peerCount: 100, reachShares: shares(0.1) }, b: { peerCount: 100, reachShares: shares(0.9) } };
    const [first, second] = recommend([chart, { ...chart, songId: "b" }], maimai, peers);
    expect(first).toMatchObject({ song: { songId: "b" }, target: { label: "SSS" }, hasPotential: true });
    expect(second).toMatchObject({ song: { songId: "a" }, target: { label: "SSS" }, hasPotential: false });
  });
});
