import { describe, expect, it } from "vitest";
import type { FetchedMaimaiData } from "./types";
import { normalizeFetchedMaimaiData } from "./normalize";

describe("maimai score normalization", () => {
  it("maps maimai player, score, recent, and event fields to common codes", async () => {
    const fetched: FetchedMaimaiData = {
      playerData: {
        iconBytes: null,
        iconContentType: null,
        displayName: "Player",
        rating: 15000,
        title: "Title",
        titleType: "rainbow",
        stars: 4,
        versionPlayCount: 12,
        totalPlayCount: 345,
        courseRankUrl: "course",
        classRankUrl: "class",
      },
      allSongsData: {
        3: [{
          songName: "Song",
          level: "14+",
          musicType: "dx",
          difficulty: "master",
          difficultyNumber: 3,
          achievement: 1_005_000,
          dxScore: 321,
          fc: "ap+",
          fs: "fs+",
        }],
      },
      recentSongsData: [{
        songName: "Song",
        level: "14+",
        musicType: "std",
        difficulty: "expert",
        difficultyNumber: 2,
        achievement: 999999,
        dxScore: 123,
        maxDxScore: 456,
        fc: "fc",
        fs: "sync",
        track: 1,
        playedAt: new Date("2026-08-27T00:00:00.000Z"),
        idx: "detail-index",
      }],
      albumData: [{
        songName: "Song",
        musicType: "dx",
        difficulty: "master",
        takenAt: new Date("2026-08-26T00:00:00.000Z"),
        imageUrl: "https://example.test/album.jpg",
        venue: "Test Arcade",
      }],
      eventsData: {
        areaEvents: [{
          name: "Area event",
          currentDistance: 10,
          nextRewardDistance: 20,
          state: "in_progress",
          imageUrl: "https://example.test/area.png",
        }],
        eventAreaEvents: [{
          name: "Event area",
          currentDistance: 30,
          nextRewardDistance: null,
          state: "completed",
          imageUrl: "https://example.test/event.png",
          eventPeriod: [100, 200],
        }],
      },
      cookies: "clal=test",
    };

    const result = await normalizeFetchedMaimaiData(fetched, { region: "intl", version: 42 });

    expect(result.player).toMatchObject({
      displayName: "Player",
      rating: 15000,
      titleType: 4,
      totalPlayCount: 345,
      currentVersionPlayCount: 12,
      iconUrl: "",
    });
    expect(result.scores).toEqual([{
      chart: {
        game: "maimai",
        region: "intl",
        version: 42,
        songName: "Song",
        chartType: 1,
        difficulty: 3,
      },
      scoreValue: 1_005_000,
      secondaryScore: 321,
      comboStatus: 4,
      syncStatus: 3,
      clearStatus: 0,
    }]);
    expect(result.recents?.[0]).toMatchObject({
      chart: { chartType: 0, difficulty: 2 },
      scoreValue: 999999,
      secondaryScore: 123,
      comboStatus: 1,
      syncStatus: 1,
      clearStatus: 0,
      maxDxScore: 456, track: 1,
    });
    expect(result.events).toEqual([
      expect.objectContaining({ name: "Area event", eventType: "area" }),
      expect.objectContaining({ name: "Event area", eventType: "eventArea", eventPeriodStart: new Date(100), eventPeriodEnd: new Date(200) }),
    ]);
  });
});
