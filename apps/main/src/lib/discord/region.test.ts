import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/queries/snapshots", () => ({ fetchLatestSnapshotData: vi.fn() }));

import { resolveRegion } from "./region";

function enableMaimai(value: string | undefined) {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", value);
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
}

afterEach(() => vi.unstubAllEnvs());

describe("resolveRegion", () => {
  it("prefers an enabled option, then the user's region, then International", () => {
    enableMaimai("jp,intl");
    expect(resolveRegion("jp", "intl")).toBe("jp");
    expect(resolveRegion("cn", "jp")).toBe("jp");
    expect(resolveRegion(undefined, "cn")).toBe("intl");
    enableMaimai("cn,jp");
    expect(resolveRegion(null, null)).toBe("cn");
  });

  it("returns null when maimai has no enabled region", () => {
    enableMaimai("");
    expect(resolveRegion("jp", "jp")).toBeNull();
  });
});
