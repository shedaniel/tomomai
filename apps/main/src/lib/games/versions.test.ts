import { requireMaimaiVersion } from "./maimai/versions";
import { afterEach, expect, it, vi } from "vitest";
import { getAvailableVersions, getCurrentVersion, getVersionInfo, getVersionFromDate } from "./versions";

afterEach(() => vi.useRealTimers());

it("preserves current maimai release timing and region metadata", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T06:59:59+09:00"));
  expect(getCurrentVersion("maimai", "jp")).toBe(13);
  vi.setSystemTime(new Date("2026-09-17T07:00:00+09:00"));
  expect(getCurrentVersion("maimai", "jp")).toBe(14);
  expect(getVersionInfo("maimai", "intl", 14)).toBeNull();
  expect(getAvailableVersions("maimai", "intl").some(v => v.id === 14)).toBe(false);
});

it("keeps CHUNITHM region availability separate", () => {
  expect(getVersionInfo("chunithm", "intl", 9)).toBeNull();
  expect(getVersionInfo("chunithm", "jp", 9)?.shortName).toBe("Mate");
  expect(getAvailableVersions("chunithm", "cn")).toEqual([]);
});

it("uses the same regional version lookup boundary for both games", () => {
  expect(getVersionFromDate("maimai", "jp", new Date("2026-09-17T07:00:00+09:00"))).toBe(14);
  expect(getVersionFromDate("chunithm", "jp", new Date("2026-07-02T06:59:59+09:00"))).toBe(8);
  expect(getVersionFromDate("chunithm", "jp", new Date("2026-07-02T07:00:00+09:00"))).toBe(9);
  expect(() => getCurrentVersion("chunithm", "cn")).toThrow("No versions available");
});

it("validates numeric versions before projecting maimai-specific data", () => {
  expect(requireMaimaiVersion(14)).toBe(14);
  expect(() => requireMaimaiVersion(999)).toThrow("Unknown maimai version");
});

it("uses a preferred version only within the latest regional release-date tie", () => {
  const date = new Date("2020-11-25T07:00:00+09:00");
  expect(getVersionFromDate("chunithm", "intl", date)).toBe(-1);
  expect(getVersionFromDate("chunithm", "intl", date, -12)).toBe(-12);
  expect(getVersionFromDate("chunithm", "intl", date, 9)).toBe(-1);
  expect(getVersionFromDate("chunithm", "intl", date, 999)).toBe(-1);
  expect(getVersionFromDate("chunithm", "intl", new Date("2026-04-16T07:00:00+09:00"), -12)).toBe(8);
});

it("keeps the existing earliest-version fallback and release instant with a hint", () => {
  expect(getVersionFromDate("chunithm", "intl", new Date("2020-11-25T06:59:59+09:00"), -1)).toBe(-12);
  expect(getVersionFromDate("chunithm", "jp", new Date("2026-07-02T06:59:59+09:00"), 9)).toBe(8);
  expect(getVersionFromDate("chunithm", "jp", new Date("2026-07-02T07:00:00+09:00"), 8)).toBe(9);
});
