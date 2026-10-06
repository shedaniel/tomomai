import { describe, expect, it } from "vitest";
import { normalizeScore } from "./normalize";

const chart = { region: "intl", gameVersion: 42 } as const;

describe("maimai score normalization", () => {
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
});
