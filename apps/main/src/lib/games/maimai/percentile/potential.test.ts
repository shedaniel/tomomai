import { describe, expect, it } from "vitest";
import { recommendationPeers } from "./potential";
import type { PercentileEntry } from "./types";

describe("recommendation peers", () => {
  it("derives the weighted peer median", () => {
    const data: PercentileEntry = {
      percentile: 0, peerCount: 100, userRating: 15000,
      distribution: [{ lo: 990000, count: 25 }, { lo: 1000000, count: 50 }, { lo: 1005000, count: 25 }],
      ratingDistribution: [], totalPlayerCount: 100, peerRatingRange: null,
    };
    expect(recommendationPeers(data)).toMatchObject({
      peerCount: 100,
      medianScore: 1000000,
      reachShares: { 990000: 1, 1000000: 0.75, 1005000: 0.25 },
    });
  });
});
