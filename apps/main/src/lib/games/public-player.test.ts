import { describe, expect, it } from "vitest";
import { toPublicGameSnapshot } from "./public-player";
import type { GameSnapshotData } from "./player-view";
import { getGameBrand, getGameRegion } from "./frontend";

const data: GameSnapshotData = {
  snapshot: { publicId: "snapshot", game: "chunithm", displayName: "Player", rating: 1600, gameVersion: 1, fetchedAt: new Date(), totalPlayCount: 100, versionPlayCount: 10 },
  songs: Array.from({ length: 25 }, (_, index) => ({
    songId: `chart-${index}`, songName: `Song ${index}`, artist: "Artist", cover: "cover", difficultyCode: 3, typeCode: 0,
    level: "14", levelPrecise: 140, genre: "Original", addedVersion: 1, scoreValue: 1009000 - index * 100,
    secondaryScore: 123, comboStatus: 2, syncStatus: 1, clearStatus: 1,
  })),
};

describe("public game snapshots", () => {
  it("preserves the maimai brand while separating CHUNITHM metadata", () => {
    expect(getGameBrand({ id: "maimai", productName: "tomomai" }).title).toBe("tomomai ともマイ");
    expect(getGameBrand({ id: "chunithm", productName: "tomochu" }).title).toBe("tomochu ともチュウ");
  });

  it("filters CHUNITHM rankings before sending public data and removes private fields", () => {
    const stored = { ...data, snapshot: { ...data.snapshot, userId: "private", id: 1 }, events: [{ name: "private" }], songs: data.songs.map(song => ({ ...song, dxScore: 123 })) };
    const result = toPublicGameSnapshot("chunithm", stored, { profileShowAllScores: false, profileShowScoreDetails: false, profileShowPlayCounts: false });
    expect(result.songs).toHaveLength(20);
    expect(result.songs.map(song => song.songId)).not.toContain("chart-24");
    expect(result.snapshot).not.toHaveProperty("userId");
    expect(result.snapshot).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("events");
    expect(result.snapshot.totalPlayCount).toBeNull();
    expect(result.songs[0]).not.toHaveProperty("dxScore");
    expect(result.songs[0]).toMatchObject({ secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0 });
  });

  it("preserves opted-in scores, details and play counts", () => {
    const result = toPublicGameSnapshot("chunithm", data, { profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlayCounts: true });
    expect(result.songs).toHaveLength(25);
    expect(result.songs[0].secondaryScore).toBe(123);
    expect(result.snapshot.totalPlayCount).toBe(100);
  });

  it("selects a supported region without carrying maimai-only CN into CHUNITHM", () => {
    const game = { id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: false, regions: ["jp", "intl"], capabilities: [] } as const;
    expect(getGameRegion(game, "cn")).toBe("jp");
    expect(getGameRegion(game, "intl")).toBe("intl");
    expect(getGameRegion({ ...game, regions: [] }, "jp")).toBeNull();
  });
});
