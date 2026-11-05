import { describe, expect, it } from "vitest";
import { comboStatusToCode, difficultyToCode, type MAIMAI_CODES } from "./codes";
import { isMaimaiNewChart, maimaiChartRating, maimaiPlayerRating } from "./rating";

const master = difficultyToCode("master");
const utage = difficultyToCode("utage");
const chart = (scoreValue: number, levelPrecise: number, combo: (typeof MAIMAI_CODES)["comboStatus"][number] = "none", difficultyCode = master) =>
  ({ scoreValue, levelPrecise, difficultyCode, comboStatus: comboStatusToCode(combo) });

describe("maimai chart rating", () => {
  it("caps accuracy at 100.5% and rates utage as zero", () => {
    expect(Math.floor(maimaiChartRating(chart(1005000, 150), 14))).toBe(337);
    expect(Math.floor(maimaiChartRating(chart(1010000, 150), 14))).toBe(337);
    expect(maimaiChartRating(chart(1005000, 150, "none", utage), 14)).toBe(0);
  });

  // Pinned from the legacy calculator this module replaced.
  it.each([
    { version: 11, combo: "none", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 11, combo: "fc", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 11, combo: "fc+", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 11, combo: "ap", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 11, combo: "ap+", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 12, combo: "none", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 12, combo: "fc", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 12, combo: "fc+", ratings: [315.168, 335.4288, 275.06194843] },
    { version: 12, combo: "ap", ratings: [316.168, 336.4288, 276.06194843] },
    { version: 12, combo: "ap+", ratings: [316.168, 336.4288, 276.06194843] },
  ] as const)("adds the AP bonus only from CiRCLE: $combo at version $version", ({ version, combo, ratings }) => {
    const rated = [chart(1005000, 140, combo), chart(1007000, 149, combo), chart(995123, 131, combo)]
      .map(input => maimaiChartRating(input, version));
    rated.forEach((rating, index) => expect(rating).toBeCloseTo(ratings[index], 10));
    for (const input of [chart(1005000, 140, combo, utage), chart(1010000, 150, combo, utage)]) {
      expect(maimaiChartRating(input, version)).toBe(0);
    }
  });
});

describe("maimai new chart window", () => {
  it("counts only the current version before CiRCLE", () => {
    expect(isMaimaiNewChart(11, 11)).toBe(true);
    expect(isMaimaiNewChart(10, 11)).toBe(false);
  });

  it("also counts the previous version from CiRCLE on", () => {
    expect(isMaimaiNewChart(12, 12)).toBe(true);
    expect(isMaimaiNewChart(11, 12)).toBe(true);
    expect(isMaimaiNewChart(10, 12)).toBe(false);
    expect(isMaimaiNewChart(12, 13)).toBe(true);
    expect(isMaimaiNewChart(11, 13)).toBe(false);
  });
});

it("sums the selected integer ratings into the player rating", () => {
  expect(maimaiPlayerRating([337, 315, 302])).toBe(954);
  expect(maimaiPlayerRating([])).toBe(0);
});
