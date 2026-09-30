import { expect, it } from 'vitest';
import { recommendationPeers } from './potential';
import type { PercentileEntry } from './types';

const data: PercentileEntry = {
  percentile: 0, peerCount: 100, userRating: 15000,
  distribution: [{ lo: 990000, count: 25 }, { lo: 1000000, count: 50 }, { lo: 1005000, count: 25 }],
  ratingDistribution: [], totalPlayerCount: 100, peerRatingRange: { min: 14875, max: 15374 },
};

it('shares how many peers reached each score target, counting ties as reached', () => {
  expect(recommendationPeers(data)).toEqual({
    peerCount: 100,
    reachShares: { 940000: 1, 970000: 1, 980000: 1, 990000: 1, 995000: 0.75, 1000000: 0.75, 1005000: 0.25 },
  });
  expect(recommendationPeers({ ...data, percentile: null })).toBeNull();
  expect(recommendationPeers({ ...data, peerCount: 29 })).toBeNull();
});
