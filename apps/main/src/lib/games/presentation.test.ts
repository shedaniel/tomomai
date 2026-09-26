import { describe, expect, it } from "vitest";
import { formatGameScore, formatGameRating, getGameDifficultyLabel, getGameChartTypeLabel, getGameStatusLabels, getGameDifficultyHex, formatGameLevel } from "./presentation";

describe("game presentation", () => {
  it("keeps maimai achievement precision and integer ratings", () => {
    expect(formatGameScore("maimai", 1_001_423)).toBe("100.1423%");
    expect(formatGameRating("maimai", 14330)).toBe("14330");
    expect(getGameDifficultyLabel("maimai", 4)).toBe("Re:MASTER");
    expect(getGameStatusLabels("maimai", { comboStatus: 4, syncStatus: 5 })).toEqual(["AP+", "FDX+"]);
  });

  it("uses CHUNITHM integer scores, hundredths and independent status codes", () => {
    expect(formatGameScore("chunithm", 1_009_000)).toBe("1,009,000");
    expect(formatGameRating("chunithm", 1625)).toBe("16.25");
    expect(getGameDifficultyLabel("chunithm", 4)).toBe("ULTIMA");
    expect(getGameChartTypeLabel("chunithm", 1)).toBe("WORLD'S END");
    expect(getGameStatusLabels("chunithm", { comboStatus: 2, syncStatus: 1, clearStatus: 2 })).toEqual(["AJ", "FULL CHAIN", "HARD"]);
  });

  it("renders independent difficulty identities and levels for song previews", () => {
    expect(getGameDifficultyHex("maimai", "remaster")).toBe("#d8b4fe");
    expect(getGameDifficultyHex("chunithm", "ultima")).toBe("#b91c1c");
    expect(getGameDifficultyLabel("chunithm", "ultima")).toBe("ULTIMA");
    expect(getGameDifficultyLabel("chunithm", "worlds-end")).toBe("WORLD'S END");
    expect(formatGameLevel("maimai", 147, "utage")).toBe("14.?");
    expect(formatGameLevel("chunithm", 147, "ultima")).toBe("14.7");
  });

  it("distinguishes a missing score from an actual zero", () => {
    expect(formatGameScore("chunithm", null)).toBe("—");
    expect(formatGameScore("chunithm", 0)).toBe("0");
    expect(formatGameRating("chunithm", undefined)).toBe("—");
    expect(formatGameRating("chunithm", 0)).toBe("0.00");
    expect(getGameStatusLabels("chunithm", { comboStatus: 0 })).toEqual([]);
  });
});
