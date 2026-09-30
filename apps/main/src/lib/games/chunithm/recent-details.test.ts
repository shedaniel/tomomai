import { expect, it } from "vitest";
import { decodeChunithmPlaylog, type ChunithmPlaylog } from "./recent-details";

const playlog: ChunithmPlaylog = {
  maxCombo: 0,
  judgments: { justiceCritical: 1234, justice: 0, attack: 0, miss: 0 },
  notePercentages: { tap: 101.25, hold: 100, slide: 0, air: 99.9, flick: 0 },
};

it("decodes a stored CHUNITHM playlog without losing zeroes or percentages above 100", () => {
  expect(decodeChunithmPlaylog(playlog)).toEqual(playlog);
});

it("does not present absent or malformed stored metadata as a fetched playlog", () => {
  for (const metadata of [
    null,
    {},
    { ...playlog, judgments: { justiceCritical: 1234 } },
    { ...playlog, maxCombo: "0" },
    { ...playlog, maxCombo: -1 },
    { ...playlog, notePercentages: { ...playlog.notePercentages, tap: null } },
  ]) {
    expect(decodeChunithmPlaylog(metadata)).toBeNull();
  }
});
