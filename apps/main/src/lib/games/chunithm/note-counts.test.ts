import { expect, it } from "vitest";
import { readChunithmNoteCounts } from "./note-counts";

const unknown = { tap: null, hold: null, slide: null, air: null, flick: null };

it("reads every kind as unknown from metadata without source counts", () => {
  expect(readChunithmNoteCounts(null)).toEqual(unknown);
  expect(readChunithmNoteCounts({ levelPreciseEstimated: true })).toEqual(unknown);
  expect(readChunithmNoteCounts({ otogeDb: { noteCounts: { tap: "625" } } })).toEqual(unknown);
});
