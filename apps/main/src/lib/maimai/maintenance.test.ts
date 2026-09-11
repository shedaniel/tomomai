import { describe, expect, it } from "vitest";
import { isMaimaiMaintenance } from "./maintenance";

describe("international maintenance in JST", () => {
  it.each([
    ["2026-09-08", 2],
    ["2026-09-09", 4],
    ["2026-09-10", 2],
    ["2026-09-11", 2],
    ["2026-09-12", 2],
    ["2026-09-13", 2],
    ["2026-09-14", 2],
  ])("uses the correct boundaries on %s", (day, endHour) => {
    const start = new Date(`${day}T01:00:00+09:00`).getTime();
    const end = new Date(`${day}T0${endHour}:00:00+09:00`).getTime();
    expect(isMaimaiMaintenance("intl", new Date(start - 1))).toBe(false);
    expect(isMaimaiMaintenance("intl", new Date(start))).toBe(true);
    expect(isMaimaiMaintenance("intl", new Date(end - 1))).toBe(true);
    expect(isMaimaiMaintenance("intl", new Date(end))).toBe(false);
    expect(isMaimaiMaintenance("intl", new Date(`${day}T06:00:00+09:00`))).toBe(false);
  });
});

describe("other regions retain their existing maintenance", () => {
  it.each(["jp", "cn"] as const)("keeps 4–7 AM JST for %s", (region) => {
    for (const day of ["2026-09-09", "2026-09-10"]) {
      expect(isMaimaiMaintenance(region, new Date(`${day}T01:00:00+09:00`))).toBe(false);
      expect(isMaimaiMaintenance(region, new Date(`${day}T03:59:59.999+09:00`))).toBe(false);
      expect(isMaimaiMaintenance(region, new Date(`${day}T04:00:00+09:00`))).toBe(true);
      expect(isMaimaiMaintenance(region, new Date(`${day}T06:59:59.999+09:00`))).toBe(true);
      expect(isMaimaiMaintenance(region, new Date(`${day}T07:00:00+09:00`))).toBe(false);
    }
  });
});
