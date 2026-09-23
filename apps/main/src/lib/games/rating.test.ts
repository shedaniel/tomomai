import { expect, it } from "vitest";
import { calculateChunithmChartRating, calculateMaimaiChartRating, selectMaimaiRankings, selectChunithmRankings } from "./rating";

it("preserves maimai rating caps and ignores utage", () => {
  expect(calculateMaimaiChartRating(1005000, 150, 3, 0, 14)).toBe(337);
  expect(calculateMaimaiChartRating(1010000, 150, 3, 0, 14)).toBe(337);
  expect(calculateMaimaiChartRating(1005000, 150, 5, 0, 14)).toBe(0);
});

it("applies CHUNITHM score thresholds in integer rating units", () => {
  expect(calculateChunithmChartRating(1009000, 150)).toBe(1715);
  expect(calculateChunithmChartRating(1007500, 150)).toBe(1700);
  expect(calculateChunithmChartRating(975000, 150)).toBe(1500);
  expect(calculateChunithmChartRating(499999, 150)).toBe(0);
});

it("uses distinct game ranking buckets without mutating inputs", () => {
  const scores = Array.from({ length: 80 }, (_, i) => ({ chartId: String(i), addedVersion: i < 40 ? 14 : 13, rating: i }));
  const original = [...scores];
  const maimai = selectMaimaiRankings(scores, 14);
  expect(maimai.newScores).toHaveLength(15);
  expect(maimai.oldScores).toHaveLength(0);
  const chunithm = selectChunithmRankings(scores, 14);
  expect(chunithm.newScores).toHaveLength(20);
  expect(chunithm.oldScores).toHaveLength(30);
  expect(scores).toEqual(original);
});
