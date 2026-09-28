import { expect, it } from "vitest";
import { decodeChunithmRecentDetails, type ChunithmRecentDetails } from "./recent-details";

const details: ChunithmRecentDetails = {
  maxCombo: 0,
  judgments: { justiceCritical: 1234, justice: 0, attack: 0, miss: 0 },
  notePercentages: { tap: 101.25, hold: 100, slide: 0, air: 99.9, flick: 0 },
};

it("decodes stored CHUNITHM detail values without losing zeroes or percentages above 100", () => {
  expect(decodeChunithmRecentDetails(details)).toEqual(details);
});

it("does not present absent or malformed stored metadata as fetched detail", () => {
  for (const metadata of [
    null,
    {},
    { ...details, judgments: { justiceCritical: 1234 } },
    { ...details, maxCombo: "0" },
    { ...details, maxCombo: -1 },
    { ...details, notePercentages: { ...details.notePercentages, tap: null } },
  ]) {
    expect(decodeChunithmRecentDetails(metadata)).toBeNull();
  }
});
