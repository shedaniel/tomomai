import { expect, it } from "vitest";
import { codeOf } from "../codes";
import { chunithmChartRating, chunithmPlayerRating, isChunithmNewChart } from "./rating";

const master = codeOf("chunithm", "difficulty", "master");
const worldsEnd = codeOf("chunithm", "difficulty", "worlds-end");
const chart = (scoreValue: number, difficultyCode = master) => ({ scoreValue, levelPrecise: 150, difficultyCode, comboStatus: 0 });

it("applies CHUNITHM score thresholds in integer rating units", () => {
  expect(chunithmChartRating(chart(1009000))).toBe(1715);
  expect(chunithmChartRating(chart(1007500))).toBe(1700);
  expect(chunithmChartRating(chart(975000))).toBe(1500);
  expect(chunithmChartRating(chart(499999))).toBe(0);
});

it("interpolates between thresholds at 0.01 granularity", () => {
  expect(chunithmChartRating(chart(1008250))).toBe(1707);
  expect(chunithmChartRating(chart(1005986))).toBe(1669);
  expect(chunithmChartRating(chart(1004473))).toBe(1644);
  expect(chunithmChartRating(chart(997045))).toBe(1588);
});

it("rates WORLD'S END charts as zero", () => {
  expect(chunithmChartRating(chart(1009000, worldsEnd))).toBe(0);
});

it("counts only the current version's charts as new", () => {
  expect(isChunithmNewChart(9, 9)).toBe(true);
  expect(isChunithmNewChart(8, 9)).toBe(false);
});

it("averages over the full 50 slots and floors the result", () => {
  expect(chunithmPlayerRating(Array.from({ length: 50 }, () => 1700))).toBe(1700);
  expect(chunithmPlayerRating([1700, 1649])).toBe(66);
  expect(chunithmPlayerRating([])).toBe(0);
});
