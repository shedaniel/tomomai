import { requireMaimaiVersion } from "./adapters/maimai/versions";
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
