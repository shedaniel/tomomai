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
    expect(results.get("parent17:i24")).toMatchObject({ percentile: 5 / 6, peerCount: 40 });
    expect(results.has("parent18:i25")).toBe(false);
    expect(results.get("parent17:i25")!.distribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(6);
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
