import { describe, expect, it } from "vitest";
import { otogeDbUrl, parseOtogeDbConstant, parseOtogeDbDate } from "./otoge-db";

describe("otoge-db data", () => {
  it("reads files from the raw repository host", () => {
    expect(otogeDbUrl("maimai/data/music-ex.json")).toBe("https://raw.githubusercontent.com/zvuc/otoge-db/main/maimai/data/music-ex.json");
  });

  it("places a date at the 07:00 JST release rollover and rejects anything but a real YYYYMMDD date", () => {
    expect(parseOtogeDbDate("20260702")?.toISOString()).toBe("2026-07-01T22:00:00.000Z");
    for (const value of [undefined, "", "2026-07-02", "20260702 ", "x20260702", "20261345"]) {
      expect(parseOtogeDbDate(value)).toBeUndefined();
    }
  });

  it("reads a constant as ×10 and treats unknown constants as missing", () => {
    expect(parseOtogeDbConstant("12.6")).toBe(126);
    expect(parseOtogeDbConstant("14")).toBe(140);
    for (const value of [undefined, "", "-", "?"]) expect(parseOtogeDbConstant(value)).toBeUndefined();
  });
});
