import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentVersion, getVersionFromDate, isVersionAvailable, parseDate } from "./metadata";

afterEach(() => vi.useRealTimers());

describe("version release times", () => {
  it.each([
    ["intl", "2026-07-23", 12, 13],
    ["jp", "2026-09-17", 13, 14],
    ["cn", "2026-06-10", 10, 11],
  ] as const)("switches %s at exactly 7 AM JST", (region, day, previous, next) => {
    for (const time of ["00:00:00", "02:00:00", "06:59:59.999"]) {
      const date = new Date(`${day}T${time}+09:00`);
      expect(getVersionFromDate(date, region)).toBe(previous);
      expect(isVersionAvailable(next, region, date)).toBe(false);
    }
    const release = new Date(`${day}T07:00:00+09:00`);
    expect(getVersionFromDate(release, region)).toBe(next);
    expect(isVersionAvailable(next, region, release)).toBe(true);
    expect(getVersionFromDate(new Date(release.toISOString()), region)).toBe(next);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(release.getTime() - 1));
    expect(getCurrentVersion(region)).toBe(previous);
    vi.setSystemTime(release);
    expect(getCurrentVersion(region)).toBe(next);
  });

  it("keeps date parsing at JST midnight", () => {
    expect(parseDate("2026/07/23").toISOString()).toBe("2026-07-22T15:00:00.000Z");
  });

  it("does not make unannounced regional releases available", () => {
    expect(isVersionAvailable(14, "intl", new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
