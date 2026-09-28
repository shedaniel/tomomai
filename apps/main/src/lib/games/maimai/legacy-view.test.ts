import { describe, expect, it } from "vitest";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { toMaimaiPlayerSnapshot, toPlayerSnapshotSummary } from "./legacy-view";

const data: GameSnapshotData = {
  snapshot: { publicId: "snap", game: "maimai", displayName: "Player", rating: 15000, gameVersion: 13, fetchedAt: new Date("2026-09-01T00:00:00Z"), titleType: 4 },
  songs: [{
    songId: "chart", songName: "Song", artist: "Artist", cover: "cover", genre: "genre", level: "14+", levelPrecise: 147,
    addedVersion: 12, difficultyCode: 3, typeCode: 1, scoreValue: 1005000, secondaryScore: null, comboStatus: 4, syncStatus: 3, clearStatus: 0,
  }],
  events: [{ name: "Event" }],
};

describe("maimai legacy view", () => {
  it("decodes codes and fills the legacy defaults", () => {
    const { snapshot, songs, events } = toMaimaiPlayerSnapshot(data);
    expect(snapshot).toMatchObject({ id: "snap", titleType: "rainbow", title: "", iconUrl: "", courseRankUrl: "", classRankUrl: "", stars: 0, versionPlayCount: 0, totalPlayCount: 0 });
    expect(songs[0]).toMatchObject({ achievement: 1005000, dxScore: 0, difficulty: "master", type: "dx", fc: "ap+", fs: "fs+" });
    expect(events).toEqual([{ name: "Event", eventType: "eventArea", currentDistance: 0, nextRewardDistance: null, state: "not_started", imageUrl: "", eventPeriodStart: null, eventPeriodEnd: null }]);
  });

  it("keeps events absent when the snapshot has none", () => {
    expect(toMaimaiPlayerSnapshot({ ...data, events: undefined }).events).toBeUndefined();
  });

  it("fills the summary's nullable legacy fields", () => {
    const summary = toPlayerSnapshotSummary({
      id: "snap", fetchedAt: new Date(), rating: 1, displayName: "Player", gameVersion: 13,
      courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
    });
    expect(summary).toMatchObject({ courseRankUrl: "", classRankUrl: "", stars: 0 });
  });
});
