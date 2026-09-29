import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({ fetchLatestSnapshotData: vi.fn(), fetchSnapshotRankings: vi.fn() }));
vi.mock("@/server/queries/snapshots", () => queries);

import { getProfileSummary, resolveRegion } from "./region";

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

describe("getProfileSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("totals the rankings stored with the latest maimai snapshot", async () => {
    const snapshot = { publicId: "latest", rating: 617, stars: null, totalPlayCount: 40, fetchedAt: new Date(0), gameVersion: 13 };
    queries.fetchLatestSnapshotData.mockResolvedValueOnce({ snapshot, songs: [], events: [] });
    queries.fetchSnapshotRankings.mockResolvedValueOnce({ newScores: [{ rating: 315 }], oldScores: [{ rating: 200 }, { rating: 102 }] });
    await expect(getProfileSummary("user", "jp")).resolves.toEqual({
      publicId: "latest", rating: 617, newRating: 315, newCount: 1, oldRating: 302, oldCount: 2, stars: 0, totalPlayCount: 40, fetchedAt: new Date(0),
    });
    expect(queries.fetchLatestSnapshotData).toHaveBeenCalledWith("maimai", "user", "jp");
    expect(queries.fetchSnapshotRankings).toHaveBeenCalledWith("maimai", "user", snapshot);
  });

  it("returns null when the user has no snapshot", async () => {
    queries.fetchLatestSnapshotData.mockResolvedValueOnce(null);
    await expect(getProfileSummary("user", "jp")).resolves.toBeNull();
    expect(queries.fetchSnapshotRankings).not.toHaveBeenCalled();
  });
});
