import { expect, it } from "vitest";
import { calculateChunithmChartRating, calculateMaimaiChartRating } from "./rating";
import { getGame } from "./registry";

const selectMaimaiRankings = getGame("maimai").rating.selectRankings;
const selectChunithmRankings = getGame("chunithm").rating.selectRankings;

it("preserves maimai rating caps and ignores utage", () => {
  expect(Math.floor(calculateMaimaiChartRating(1005000, 150, 3, 0, 14))).toBe(337);
  expect(Math.floor(calculateMaimaiChartRating(1010000, 150, 3, 0, 14))).toBe(337);
  expect(calculateMaimaiChartRating(1005000, 150, 5, 0, 14)).toBe(0);
});

it("applies CHUNITHM score thresholds in integer rating units", () => {
  expect(calculateChunithmChartRating(1009000, 150)).toBe(1715);
  expect(calculateChunithmChartRating(1007500, 150)).toBe(1700);
  expect(calculateChunithmChartRating(975000, 150)).toBe(1500);
  expect(calculateChunithmChartRating(499999, 150)).toBe(0);
});

it("uses distinct game ranking buckets without mutating inputs", () => {
  const scores = Array.from({ length: 80 }, (_, i) => ({ chartId: String(i), scoreValue: 1000000, addedVersion: i < 40 ? 14 : 13, rating: i }));
  const original = [...scores];
  const maimai = selectMaimaiRankings(scores, 14);
  expect(maimai.newScores).toHaveLength(15);
  expect(maimai.oldScores).toHaveLength(0);
  const chunithm = selectChunithmRankings(scores, 14);
  expect(chunithm.newScores).toHaveLength(20);
  expect(chunithm.oldScores).toHaveLength(30);
  expect(scores).toEqual(original);
});

it("keeps maimai's precise rating and achievement ordering at the B15 cutoff", () => {
  const chart = (chartId: string, scoreValue: number) => ({
    chartId, scoreValue, addedVersion: 14,
    rating: calculateMaimaiChartRating(scoreValue, 150, 3, 0, 14),
  });
  const leaders = Array.from({ length: 14 }, (_, index) => chart(`leader-${index}`, 1005000));
  const selected = selectMaimaiRankings([
    ...leaders, chart("lower", 995100), chart("higher", 995200),
  ], 14);
  expect(selected.newScores.at(-1)?.chartId).toBe("higher");
  expect(selected.newScores.at(-1)?.rating).toBe(314);
  expect(selected.newRemaining[0].chartId).toBe("lower");

  const tied = selectMaimaiRankings([chart("capped-low", 1005000), chart("capped-high", 1006000)], 14);
  expect(tied.newScores.map(score => score.chartId)).toEqual(["capped-high", "capped-low"]);
});
