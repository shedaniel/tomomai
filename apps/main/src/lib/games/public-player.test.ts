import { describe, expect, it } from "vitest";
import { toPublicGameSnapshot } from "./public-player";
import type { GameSnapshotData } from "./player-view";

const data: GameSnapshotData = {
  snapshot: { publicId: "snapshot", game: "chunithm", displayName: "Player", rating: 1600, gameVersion: 1, fetchedAt: new Date(), totalPlayCount: 100, versionPlayCount: 10 },
  songs: Array.from({ length: 25 }, (_, index) => ({
    songId: `chart-${index}`, songName: `Song ${index}`, artist: "Artist", cover: "cover", difficultyCode: 3, typeCode: 0,
    level: "14", levelPrecise: 140, genre: "Original", addedVersion: 1, scoreValue: 1009000 - index * 100,
    secondaryScore: 123, comboStatus: 2, syncStatus: 1, clearStatus: 1,
  })),
};

describe("public game snapshots", () => {
  it("filters CHUNITHM rankings before sending public data and removes private fields", () => {
    const stored = { ...data, snapshot: { ...data.snapshot, userId: "private", id: 1 }, events: [{ name: "private" }], songs: data.songs.map(song => ({ ...song, dxScore: 123 })) };
    const result = toPublicGameSnapshot("chunithm", stored, { profileShowAllScores: false, profileShowScoreDetails: false, profileShowPlayCounts: false });
    expect(result.songs).toHaveLength(20);
    expect(result.songs.map(song => song.songId)).not.toContain("chart-24");
    expect(result.snapshot).not.toHaveProperty("userId");
    expect(result.snapshot).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("events");
    expect(result.snapshot).toMatchObject({ versionPlayCount: null, totalPlayCount: null });
    expect(result.songs[0]).not.toHaveProperty("dxScore");
    expect(result.songs[0].chartRating).toBeGreaterThan(0);
    expect(result.songs[0]).toMatchObject({ secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0 });
  });

  it("rejects a snapshot from a different game", () => {
    expect(() => toPublicGameSnapshot("maimai", data, { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlayCounts: true })).toThrow("Snapshot game does not match");
  });

  it("preserves opted-in scores, details and play counts", () => {
    const result = toPublicGameSnapshot("chunithm", data, { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlayCounts: true });
    expect(result.songs).toHaveLength(25);
    expect(result.songs[0].secondaryScore).toBe(123);
    expect(result.snapshot.totalPlayCount).toBe(100);
  });

  it("keeps maimai score details, play counts and non-best scores private under restrictive settings", () => {
    const maimai: GameSnapshotData = {
      snapshot: { ...data.snapshot, game: "maimai", gameVersion: 20, versionPlayCount: 10 },
      songs: Array.from({ length: 40 }, (_, index) => ({
        ...data.songs[0], songId: `chart-${index}`, levelPrecise: 130, scoreValue: 1005000 - index * 100,
        secondaryScore: 2000, comboStatus: 4, syncStatus: 5, clearStatus: 1,
      })),
      events: [{ name: "event" }],
    };
    const result = toPublicGameSnapshot("maimai", maimai, { profileShowAllScores: false, profileShowScoreDetails: false, profileShowPlayCounts: false, profileShowEvents: false });
    expect(result.songs).toHaveLength(35);
    expect(result.snapshot).toMatchObject({ versionPlayCount: null, totalPlayCount: null });
    expect(result).not.toHaveProperty("events");
    for (const song of result.songs) expect(song).toMatchObject({ secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0 });
  });
});
