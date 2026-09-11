import { describe, expect, it } from 'vitest';
import { recommendationPeers, recommendationEfficiency } from './recommendation-potential';
import { generateRecommendations, ACCURACY_VALUES } from '@/server/queries/recommendations';
import type { PercentileEntry } from './percentile-types';

const data: PercentileEntry = {
  percentile: 0, peerCount: 100, userRating: 15000,
  distribution: [{ lo: 990000, count: 25 }, { lo: 1000000, count: 50 }, { lo: 1005000, count: 25 }],
  ratingDistribution: [], totalPlayerCount: 100, peerRatingRange: { min: 14875, max: 15374 },
};
const song = {
  songId: 'a', songName: 'Chart', difficulty: 'master' as const,
  type: 'dx' as const, achievement: 996440, levelPrecise: 136, rating: 285,
  addedVersion: 13 as const, fc: 'none' as const, fs: 'none' as const, dxScore: 0,
  artist: '', cover: '', level: '13+', genre: '',
};

describe('peer-aware recommendation efficiency', () => {
  it('retains reach shares for every grade, including ties and no AP inference', () => {
    const peers = recommendationPeers(data, ACCURACY_VALUES)!;
    expect(peers.reachShares[99]).toBe(1);
    expect(peers.reachShares[100]).toBe(0.75);
    expect(peers.reachShares[100.5]).toBe(0.25);
    expect(peers.reachShares[101]).toBeUndefined();
    expect(recommendationPeers({ ...data, percentile: null }, ACCURACY_VALUES)).toBeNull();
    expect(recommendationPeers({ ...data, peerCount: 29 }, ACCURACY_VALUES)).toBeNull();
  });

  it('continuously rewards common targets and discounts uncommon targets', () => {
    const peers = recommendationPeers(data, ACCURACY_VALUES)!;
    expect(recommendationEfficiency(20, 10, 100, peers).efficiencyScore).toBeCloseTo(50.3968, 3);
    expect(recommendationEfficiency(20, 10, 100.5, peers).efficiencyScore).toBeCloseTo(7.9370, 3);
    expect(recommendationEfficiency(20, 10, 100, { ...peers, reachShares: { 100: 0.68 } }).efficiencyScore).toBeGreaterThan(20);
  });

  it('reduces sparse-data influence and falls back without evidence', () => {
    const peers = { peerCount: 100, reachShares: { 100: 0.9 } };
    expect(recommendationEfficiency(20, 10, 100, { ...peers, peerCount: 30 }).efficiencyScore)
      .toBeLessThan(recommendationEfficiency(20, 10, 100, peers).efficiencyScore);
    expect(recommendationEfficiency(20, 10, 100).efficiencyScore).toBe(20);
    expect(recommendationEfficiency(2, 1, 101, peers).efficiencyScore).toBe(2);
    expect(recommendationEfficiency(10, 1, 100, peers).efficiencyScore).toBe(10);
  });

  it('gives strong peer evidence more influence without unbounded weights', () => {
    const common = recommendationEfficiency(20, 10, 100, { peerCount: 100, reachShares: { 100: 0.9 } });
    const rare = recommendationEfficiency(20, 10, 100, { peerCount: 100, reachShares: { 100: 0.1 } });
    expect(common.peerWeight).toBeGreaterThan(4);
    expect(rare.peerWeight).toBeLessThan(0.25);
    expect(recommendationEfficiency(20, 10, 100, { peerCount: 100000, reachShares: { 100: 1 } }).peerWeight).toBeLessThanOrEqual(16);
    expect(recommendationEfficiency(20, 10, 100, { peerCount: 100000, reachShares: { 100: 0 } }).peerWeight).toBeGreaterThanOrEqual(0.0625);
  });

  it('sorts inside the generator using peers while retaining grade targets', () => {
    const peers = {
      a: { peerCount: 100, reachShares: { 100: 0.1 } },
      b: { peerCount: 100, reachShares: { 100: 0.9 } },
    };
    const result = generateRecommendations([song, { ...song, songId: 'b' }], 13, peers);
    expect(result[0]).toMatchObject({ song: { songId: 'b' }, targetAccuracy: 100, hasPotential: true });
    expect(result[1]).toMatchObject({ song: { songId: 'a' }, targetAccuracy: 100, hasPotential: false });
    expect(result.every(rec => ACCURACY_VALUES.includes(rec.targetAccuracy))).toBe(true);
    expect(result[0].efficiencyScore).toBeGreaterThan(result[1].efficiencyScore);
    expect(generateRecommendations([song], 13).every(rec => rec.efficiencyScore === rec.efficiency)).toBe(true);
  });
});
