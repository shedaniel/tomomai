import { describe, expect, it } from "vitest";
import { normalizeEvents, normalizePlayer, normalizeRecent, normalizeScore } from "./normalize";

const chart = { region: "intl", gameVersion: 42 } as const;

describe("maimai score normalization", () => {
  it("maps the player to common codes", () => {
    expect(normalizePlayer({
      iconUrl: "https://images.test/icons/player.png",
      displayName: "Player",
      rating: 15000,
      title: "Title",
      titleType: "rainbow",
      stars: 4,
      versionPlayCount: 12,
      totalPlayCount: 345,
      courseRankUrl: "course",
      classRankUrl: "class",
    })).toMatchObject({
      displayName: "Player",
      rating: 15000,
      titleType: 4,
      totalPlayCount: 345,
      currentVersionPlayCount: 12,
      iconUrl: "https://images.test/icons/player.png",
    });
  });

  it("maps a score to the fetched region and version", () => {
    expect(normalizeScore({
      songName: "Song",
      musicType: "dx",
      difficulty: "master",
      achievement: 1_005_000,
      dxScore: 321,
      fc: "ap+",
      fs: "fs+",
    }, chart)).toEqual({
      chart: { game: "maimai", region: "intl", version: 42, songName: "Song", chartType: 1, difficulty: 3 },
      scoreValue: 1_005_000,
      secondaryScore: 321,
      comboStatus: 4,
      syncStatus: 3,
      clearStatus: 0,
    });
  });

  it("keeps a recent play's time, track and maximum DX score", () => {
    expect(normalizeRecent({
      songName: "Song",
      level: "14+",
      musicType: "std",
      difficulty: "expert",
      achievement: 999999,
      dxScore: 123,
      maxDxScore: 456,
      fc: "fc",
      fs: "sync",
      track: 1,
      playedAt: new Date("2026-08-27T00:00:00.000Z"),
      idx: "detail-index",
    }, chart)).toMatchObject({
      chart: { chartType: 0, difficulty: 2 },
      scoreValue: 999999,
      secondaryScore: 123,
      comboStatus: 1,
      syncStatus: 1,
      clearStatus: 0,
      maxDxScore: 456,
      track: 1,
      playedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
  });

  it("maps area and event area events", () => {
    expect(normalizeEvents({
      areaEvents: [{ name: "Area event", currentDistance: 10, nextRewardDistance: 20, state: "in_progress", imageUrl: "https://example.test/area.png" }],
      eventAreaEvents: [{ name: "Event area", currentDistance: 30, nextRewardDistance: null, state: "completed", imageUrl: "https://example.test/event.png", eventPeriod: [100, 200] }],
    })).toEqual([
      expect.objectContaining({ name: "Area event", eventType: "area" }),
      expect.objectContaining({ name: "Event area", eventType: "eventArea", eventPeriodStart: new Date(100), eventPeriodEnd: new Date(200) }),
    ]);
  });
});
