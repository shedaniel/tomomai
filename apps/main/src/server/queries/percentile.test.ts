import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, transaction } = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));

import { getChartPercentiles } from "./percentile";

describe("parent chart percentiles", () => {
  beforeEach(() => {
    execute.mockReset();
    transaction.mockImplementation(async (callback) => callback({ execute }));
  });

  it("uses the parent identity and merges balanced peer bands", async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { parent_id: "17", band_lo: 15000, achievements: [980000, 990000, 1000000], player_count: 20 },
      { parent_id: "17", band_lo: 15125, achievements: [985000, 995000, 1005000], player_count: 20 },
    ]);
    const results = await getChartPercentiles([
      { publicSongId: "parent17:i25", parentId: BigInt(17), achievement: 995000 },
      { publicSongId: "parent17:i24", parentId: BigInt(17), achievement: 1005000 },
      { publicSongId: "parent18:i25", parentId: BigInt(18), achievement: 1000000 },
    ], 15000);
    expect(results.get("parent17:i25")).toMatchObject({ percentile: 0.5, peerCount: 40 });
    expect(results.get("parent17:i24")!.percentile).toBeCloseTo(5 / 6);
    expect(results.has("parent18:i25")).toBe(false);
    expect(results.get("parent17:i25")!.distribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBeCloseTo(40);
  });

  it("weights sampled bands by their full player populations and includes ties", async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { parent_id: "17", band_lo: 15000, achievements: [990000, 995000], player_count: 60 },
      { parent_id: "17", band_lo: 15125, achievements: [1000000, 1005000], player_count: 20 },
      { parent_id: "17", band_lo: 17000, achievements: [1010000], player_count: 100 },
    ]);
    const result = (await getChartPercentiles([
      { publicSongId: "17", parentId: BigInt(17), achievement: 995000 },
    ], 15000)).get("17")!;
    expect(result.percentile).toBeCloseTo(30 / 80);
    expect(result.distribution).toEqual([
      { lo: 990000, count: 30 }, { lo: 995000, count: 30 },
      { lo: 1000000, count: 10 }, { lo: 1005000, count: 10 },
    ]);
    expect(result.totalPlayerCount).toBe(180);
    expect(result.ratingDistribution).toContainEqual({ ratingLo: 17000, achievementLo: 1010000, count: 1 });
    expect(result.peerRatingRange).toEqual({ min: 15000, max: 15249 });
  });

  it("expands a 20–29 player pool and includes the eighth band", async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { parent_id: "17", band_lo: 15000, achievements: [990000], player_count: 25 },
      { parent_id: "17", band_lo: 15500, achievements: [1000000], player_count: 10 },
    ]);
    const result = (await getChartPercentiles([{ publicSongId: "17", parentId: BigInt(17), achievement: 995000 }], 15000)).get("17")!;
    expect(result.peerCount).toBe(35);
    expect(result.percentile).toBeCloseTo(25 / 35);
  });

  it("keeps all-rating clusters when nearby peers are absent or skewed", async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { parent_id: "17", band_lo: 17000, achievements: [1000000], player_count: 40 },
      { parent_id: "18", band_lo: 15125, achievements: [1000000], player_count: 40 },
    ]);
    const results = await getChartPercentiles([
      { publicSongId: "17", parentId: BigInt(17), achievement: 995000 },
      { publicSongId: "18", parentId: BigInt(18), achievement: 995000 },
    ], 15000);
    for (const result of results.values()) {
      expect(result.percentile).toBeNull();
      expect(result.distribution).toEqual([]);
      expect(result.ratingDistribution).toHaveLength(1);
    }
  });

  it("degrades to no percentile until the materialized view exists", async () => {
    execute.mockRejectedValueOnce({ cause: { code: "42P01" } });
    expect(await getChartPercentiles([{ publicSongId: "parent17:i25", parentId: BigInt(17), achievement: 1000000 }], 15000)).toEqual(new Map());
  });

  it("does not hide unexpected database failures", async () => {
    execute.mockRejectedValueOnce(new Error("connection lost"));
    await expect(getChartPercentiles([{ publicSongId: "parent17:i25", parentId: BigInt(17), achievement: 1000000 }], 15000)).rejects.toThrow("connection lost");
  });
});
