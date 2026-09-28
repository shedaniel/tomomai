import { describe, expect, it } from "vitest";
import type { GamePlayerScore, GameSnapshotData } from "@/lib/games/player-view";
import { generateRecommendations } from "./recommendations";

const song: GamePlayerScore = {
  songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
  addedVersion: 9, difficultyCode: 3, typeCode: 0, scoreValue: 1000000, secondaryScore: 0,
  comboStatus: 0, syncStatus: 0, clearStatus: 0,
};
const snapshot: GameSnapshotData["snapshot"] = {
  publicId: "snapshot", game: "chunithm", gameVersion: 9, displayName: "Player", rating: 30, fetchedAt: new Date(),
};
function recommend(songs: GamePlayerScore[], overrides: Partial<GameSnapshotData["snapshot"]> = {}) {
  return generateRecommendations({ snapshot: { ...snapshot, ...overrides }, songs });
}

describe("game rating recommendations", () => {
  it("uses CHUNITHM grade thresholds and the floored average gain, with no AP target", () => {
    const recommendations = recommend([song]);
    expect(recommendations.map(rec => rec.targetScore)).toEqual([1005000, 1007500, 1009000]);
    expect(recommendations[0]).toMatchObject({ currentRating: 1500, targetRating: 1550, ratingGain: 1, category: "new", isInBest: true });
    expect(recommendations[2]).toMatchObject({ targetRating: 1615, ratingGain: 2 });
  });
  it("compares full new/old pools against their own B20/B30 cutoff", () => {
    const newBest = Array.from({ length: 20 }, (_, i) => ({ ...song, songId: `new-${i}`, scoreValue: 1007500 }));
    const oldBest = Array.from({ length: 30 }, (_, i) => ({ ...song, songId: `old-${i}`, scoreValue: 1005000, addedVersion: 8 }));
    const recommendations = recommend([...newBest, ...oldBest, song, { ...song, songId: "old-candidate", addedVersion: 8 }]);
    expect(recommendations.filter(rec => rec.song.songId === "chart")).toEqual([]);
    expect(recommendations.find(rec => rec.song.songId === "old-candidate")).toMatchObject({ targetScore: 1007500, ratingGain: 1, isInBest: false, category: "old" });
  });
  it("keeps partial-pool contributions and floors the resulting average only after summing", () => {
    const recommendations = recommend([song, { ...song, songId: "other", chartRating: 1549 }]);
    expect(recommendations.find(rec => rec.song.songId === "chart")).toMatchObject({ targetScore: 1005000, ratingGain: 1 });
    expect(recommendations.find(rec => rec.song.songId === "chart" && rec.targetScore === 1009000)?.ratingGain).toBe(3);
    expect(recommend([{ ...song, difficultyCode: 5 }])).toEqual([]);
  });
  it("preserves maimai previous-version new pools and version-gated AP targets", () => {
    const mai = { ...song, addedVersion: 12, scoreValue: 1005000, levelPrecise: 140 };
    expect(recommend([mai], { game: "maimai", gameVersion: 13 })[0]).toMatchObject({ targetScore: 1010000, ratingGain: 1, category: "new" });
    expect(recommend([{ ...mai, comboStatus: 3 }], { game: "maimai", gameVersion: 13 })).toEqual([]);
    expect(recommend([mai], { game: "maimai", gameVersion: 11 })).toEqual([]);
  });
});
