import { afterEach, expect, it, vi } from "vitest";
import { getAvailableVersions, getCurrentVersion, getVersionInfo } from "./versions";

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
