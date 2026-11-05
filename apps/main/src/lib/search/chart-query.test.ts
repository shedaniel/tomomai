import { describe, expect, it } from "vitest";
import { parseGameScore } from "@/lib/games/presentation";
import { matchesChartQuery, needsScores, parseChartQuery, parseRatingQuery } from "./chart-query";

const master14p = { level: "14+", levelPrecise: 147, difficultyCode: 3, typeCode: 1 };

describe("parseChartQuery", () => {
  it("reads levels, difficulties and negated statuses", () => {
    const query = parseChartQuery("maimai", "14+ master !fc")!;
    expect(query.levels).toEqual([{ level: "14+" }]);
    expect(query.difficulties).toEqual([3]);
    expect(query.statuses).toEqual([{ kind: "comboStatus", code: 1, reached: false }]);
    expect(needsScores(query)).toBe(true);
  });

  it("reads level ranges and comparisons in tenths", () => {
    expect(parseChartQuery("maimai", "13.5-13.9")!.levels).toEqual([{ min: 135, max: 139 }]);
    expect(parseChartQuery("maimai", "13-14")!.levels).toEqual([{ min: 130, max: 149 }]);
    expect(parseChartQuery("maimai", ">=14")!.levels).toEqual([{ min: 140, max: Infinity }]);
    expect(parseChartQuery("maimai", "<13")!.levels).toEqual([{ min: 0, max: 129 }]);
  });

  it("reads grades as score bounds", () => {
    expect(parseChartQuery("maimai", "sss+")!.minScore).toBe(1_005_000);
    expect(parseChartQuery("maimai", "<sss")!.belowScore).toBe(1_000_000);
    expect(parseChartQuery("chunithm", "<sss")!.belowScore).not.toBeNull();
  });

  it("leaves titles to the song search", () => {
    expect(parseChartQuery("maimai", "darekano shinzo")).toBeNull();
    expect(parseChartQuery("maimai", "a")).toBeNull();
    expect(parseChartQuery("maimai", "14+ fragrance")).toBeNull();
    expect(parseChartQuery("maimai", "")).toBeNull();
  });

  it("reads random and played", () => {
    const query = parseChartQuery("chunithm", "random 13+ unplayed")!;
    expect(query.random).toBe(true);
    expect(query.played).toBe(false);
  });
});

describe("matchesChartQuery", () => {
  const notFc = parseChartQuery("maimai", "14+ !fc")!;

  it("keeps played charts that have not reached the status", () => {
    expect(matchesChartQuery(notFc, master14p, { scoreValue: 1_000_000, comboStatus: 0 })).toBe(true);
    expect(matchesChartQuery(notFc, master14p, { scoreValue: 1_000_000, comboStatus: 3 })).toBe(false);
    expect(matchesChartQuery(notFc, master14p, null)).toBe(false);
  });

  it("checks levels and played state", () => {
    expect(matchesChartQuery(notFc, { ...master14p, level: "14" }, { scoreValue: 0, comboStatus: 0 })).toBe(false);
    const unplayed = parseChartQuery("maimai", "unplayed")!;
    expect(matchesChartQuery(unplayed, master14p, null)).toBe(true);
    expect(matchesChartQuery(unplayed, master14p, { scoreValue: 1 })).toBe(false);
  });
});

describe("rating queries", () => {
  it("reads a constant and a score in each game's notation", () => {
    expect(parseRatingQuery("14.7 100.5")).toEqual({ levelPrecise: 147, score: "100.5" });
    expect(parseRatingQuery("14 100.5")).toBeNull();
    expect(parseGameScore("maimai", "100.5%")).toBe(1_005_000);
    expect(parseGameScore("maimai", "102")).toBeNull();
    expect(parseGameScore("chunithm", "1,007,500")).toBe(1_007_500);
    expect(parseGameScore("chunithm", "1007.5k")).toBe(1_007_500);
    expect(parseGameScore("chunithm", "abc")).toBeNull();
  });
});
