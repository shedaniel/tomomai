import { expect, it } from "vitest";
import { readChunithmNoteCounts } from "./note-counts";

it("reads every kind the metadata leaves out as unknown", () => {
  expect(readChunithmNoteCounts(null)).toEqual({ tap: null, hold: null, slide: null, air: null, flick: null });
  expect(readChunithmNoteCounts({ levelPreciseEstimated: true })).toEqual({ tap: null, hold: null, slide: null, air: null, flick: null });
  expect(readChunithmNoteCounts({ noteCounts: { tap: 625, air: 0 } })).toEqual({ tap: 625, hold: null, slide: null, air: 0, flick: null });
});
