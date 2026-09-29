import { describe, expect, it } from "vitest";
import { GAME_CODES, codeOf } from "./codes";
import {
  formatGameLevel,
  formatGameRating,
  formatGameScore,
  formatGameScoreDelta,
  getGameChartType,
  getGameChartTypeBadge,
  getGameChartTypeBadgeLabel,
  getGameDifficulty,
  getGameRankingBuckets,
  getGameScoreBenchmarks,
  getGameScoreGrade,
  getGameStatusBadges,
  getGameStatusLabels,
  getGrade,
} from "./presentation";
import { getGame } from "./registry";
import { CANONICAL_GAME_IDS, SCORE_STATUS_KINDS } from "./types";

const difficulty = (game: "maimai" | "chunithm", key: string) => getGameDifficulty(game, codeOf(game, "difficulty", key));

describe("game presentation", () => {
  it("keeps maimai achievement precision and integer ratings", () => {
    expect(formatGameScore("maimai", 1_001_423)).toBe("100.1423%");
    expect(formatGameRating("maimai", 14330)).toBe("14330");
    expect(formatGameRating("maimai", 300.456, { average: true })).toBe("300.46");
    expect(difficulty("maimai", "remaster").label).toBe("Re:MASTER");
    expect(getGameStatusLabels("maimai", { comboStatus: 4, syncStatus: 5 })).toEqual(["AP+", "FDX+"]);
  });

  it("floors maimai compact scores and their differences", () => {
    expect(formatGameScore("maimai", 999_956, { precision: "compact" })).toBe("99.99%");
    expect(formatGameScore("maimai", 2_900, { precision: "compact" })).toBe("0.29%");
    expect(formatGameScoreDelta("maimai", 994_567, 995_000)).toBe("0.05%");
  });

  it("uses CHUNITHM integer scores, hundredths and independent status codes", () => {
    expect(formatGameScore("chunithm", 1_009_000)).toBe("1,009,000");
    expect(formatGameScore("chunithm", 1_009_000, { precision: "compact" })).toBe("1,009,000");
    expect(formatGameScoreDelta("chunithm", 1_005_000, 1_007_500)).toBe("2,500");
    expect(formatGameRating("chunithm", 1625)).toBe("16.25");
    expect(formatGameRating("chunithm", 1625, { average: true })).toBe("16.25");
    expect(difficulty("chunithm", "ultima").label).toBe("ULTIMA");
    expect(getGameChartType("chunithm", 0).label).toBe("STANDARD");
    expect(getGameChartType("chunithm", 1).label).toBe("#1");
    expect(getGameStatusLabels("chunithm", { comboStatus: 2, syncStatus: 1, clearStatus: 2 })).toEqual(["AJ", "FULL CHAIN", "HARD"]);
  });

  it("renders independent difficulty identities and levels for song previews", () => {
    expect(difficulty("maimai", "remaster").hex).toBe("#d8b4fe");
    expect(difficulty("chunithm", "ultima").hex).toBe("#b91c1c");
    expect(difficulty("chunithm", "worlds-end").label).toBe("WORLD'S END");
    expect(formatGameLevel("maimai", 147, codeOf("maimai", "difficulty", "utage"))).toBe("14.?");
    expect(formatGameLevel("chunithm", 147, codeOf("chunithm", "difficulty", "ultima"))).toBe("14.7");
  });

  it("gives CHUNITHM WORLD'S END its own colours instead of maimai utage pink", () => {
    const worldsEnd = difficulty("chunithm", "worlds-end");
    const utage = difficulty("maimai", "utage");
    expect(worldsEnd.hex).not.toBe(utage.hex);
    for (const [name, classes] of Object.entries(worldsEnd.classes)) {
      expect(classes, name).not.toContain("pink");
    }
  });

  it("restores the maimai compact cells, recent badges and song detail palette", () => {
    const master = difficulty("maimai", "master");
    expect(master.classes.cell).toContain("bg-purple-300");
    expect(master.classes.cell).toContain("border-purple-400");
    expect(difficulty("maimai", "basic").classes.badge).toContain("bg-green-400");
    expect(difficulty("maimai", "basic").cssVar).toBe("var(--color-green-400)");
    expect(difficulty("maimai", "basic").classes.solidBg).toBe("bg-emerald-500");
    expect(difficulty("maimai", "utage").shortLabel).toBe("宴");
  });

  it("badges maimai chart types and never shows the CHUNITHM standard type", () => {
    expect(getGameChartTypeBadgeLabel("maimai", 1)).toBe("DX");
    expect(getGameChartTypeBadge("maimai", codeOf("maimai", "chartType", "std"))).toMatch(/\/covers\/music_standard\.webp$/);
    expect(getGameChartType("maimai", codeOf("maimai", "chartType", "dx")).ogLabel).toBe("でらっくす");
    expect(getGameChartTypeBadgeLabel("chunithm", 0)).toBeNull();
    expect(getGameChartTypeBadge("chunithm", 0)).toBeNull();
  });

  it("styles maimai status badges and hides the plain CHUNITHM clear lamp", () => {
    expect(getGameStatusBadges("maimai", { comboStatus: codeOf("maimai", "comboStatus", "ap+") })[0].className).toContain("bg-gradient-to-r");
    expect(getGameStatusLabels("chunithm", { clearStatus: codeOf("chunithm", "clearStatus", "clear") })).toEqual([]);
    expect(getGameStatusLabels("chunithm", { comboStatus: 9 })).toEqual(["comboStatus #9"]);
    expect(getGame("chunithm").presentation.statusColumns).toEqual([{ labelKey: "status", kinds: ["comboStatus", "syncStatus", "clearStatus"] }]);
  });

  it.each(CANONICAL_GAME_IDS)("presents every %s code", game => {
    const codes = GAME_CODES[game];
    codes.difficulty.forEach((_, code) => expect(getGameDifficulty(game, code).label).not.toMatch(/^#/));
    codes.chartType.forEach((_, code) => expect(getGameChartType(game, code).label).not.toMatch(/^#/));
    for (const kind of SCORE_STATUS_KINDS) {
      codes[kind].forEach((_, code) => expect(getGameStatusLabels(game, { [kind]: code }).join()).not.toMatch(/#/));
    }
  });

  it("sizes the shared ranking buckets per game", () => {
    expect(getGameRankingBuckets("maimai").map(({ code, key, label }) => [code, key, label])).toEqual([[1, "new", "B15"], [2, "old", "B35"]]);
    expect(getGameRankingBuckets("chunithm").map(({ code, size }) => [code, size])).toEqual([[1, 20], [2, 30]]);
  });

  it("distinguishes a missing score from an actual zero", () => {
    expect(formatGameScore("chunithm", null)).toBe("—");
    expect(formatGameScore("chunithm", 0)).toBe("0");
    expect(formatGameRating("chunithm", undefined)).toBe("—");
    expect(formatGameRating("chunithm", 0)).toBe("0.00");
    expect(getGameStatusLabels("chunithm", { comboStatus: 0 })).toEqual([]);
  });
});

describe("grades", () => {
  it.each([
    { game: "maimai", scores: [[1_005_000, "SSS+"], [1_004_999, "SSS"], [970_000, "S"], [499_999, "D"], [0, "D"]] },
    { game: "chunithm", scores: [[1_009_000, "SSS+"], [1_007_499, "SS+"], [899_999, "BBB"], [500_000, "C"], [0, "D"]] },
  ] as const)("grades $game scores from one table", ({ game, scores }) => {
    for (const [scoreValue, grade] of scores) expect(getGrade(game, scoreValue)).toBe(grade);
  });

  it("lists every maimai grade and the CHUNITHM grades from SSS+ to A as benchmarks", () => {
    expect(getGameScoreBenchmarks("maimai").map(benchmark => benchmark.label)).toEqual(
      ["SSS+", "SSS", "SS+", "SS", "S+", "S", "AAA", "AA", "A", "BBB", "BB", "B", "C", "D"],
    );
    expect(getGameScoreBenchmarks("chunithm").map(benchmark => [benchmark.scoreValue, benchmark.label])).toEqual([
      [1_009_000, "SSS+"], [1_007_500, "SSS"], [1_005_000, "SS+"], [1_000_000, "SS"], [990_000, "S+"],
      [975_000, "S"], [950_000, "AAA"], [925_000, "AA"], [900_000, "A"],
    ]);
  });

  it("shows a maimai all perfect as SSS+ AP only once the AP bonus exists", () => {
    const ap = codeOf("maimai", "comboStatus", "ap");
    expect(getGameScoreGrade("maimai", 1_003_000, 12, ap)).toBe("SSS+ AP");
    expect(getGameScoreGrade("maimai", 1_003_000, 11, ap)).toBe("SSS");
    expect(getGameScoreGrade("maimai", 1_003_000, 12, codeOf("maimai", "comboStatus", "fc+"))).toBe("SSS");
    expect(getGame("maimai").rating.bonuses(12)).toEqual([{ label: "AP", scoreValue: 1_005_000, comboStatuses: [ap, codeOf("maimai", "comboStatus", "ap+")] }]);
    expect(getGameScoreGrade("chunithm", 1_010_000, 99, codeOf("chunithm", "comboStatus", "ajc"))).toBe("SSS+");
  });
});
