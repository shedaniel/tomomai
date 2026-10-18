import { describe, expect, it } from 'vitest';
import { recommendationPeers, type RecommendationPeers } from './recommendation-potential';
import { addRatingsAndSort } from './rating-calculator';
import { ACCURACY_VALUES, generateUnplayedRecommendations, unplayedRatingFloors } from '@/server/queries/recommendations';
import type { PercentileEntry } from './percentile-types';
import type { SongBase } from './types';

const chart = (songId: string, levelPrecise: number, addedVersion: number, difficulty: SongBase['difficulty'] = 'master'): SongBase => ({
  songId, songName: songId, artist: '', cover: '', type: 'dx', difficulty,
  level: '13', levelPrecise, genre: '', addedVersion: addedVersion as SongBase['addedVersion'],
});
const played = (songId: string, addedVersion: number) => ({
  ...chart(songId, 130, addedVersion), achievement: 1005000, fc: 'none' as const, fs: 'none' as const, dxScore: 0,
});

// 15 new and 35 old charts at 13.0 SSS+ put both floors at 292
const best = addRatingsAndSort([
  ...Array.from({ length: 15 }, (_, i) => played(`new${i}`, 13)),
  ...Array.from({ length: 35 }, (_, i) => played(`old${i}`, 1)),
], 13);

describe('unplayed recommendations', () => {
  it('derives the weighted peer median', () => {
    const data: PercentileEntry = {
      percentile: 0, peerCount: 100, userRating: 15000,
      distribution: [{ lo: 990000, count: 25 }, { lo: 1000000, count: 50 }, { lo: 1005000, count: 25 }],
      ratingDistribution: [], totalPlayerCount: 100, peerRatingRange: null,
    };
    expect(recommendationPeers(data, ACCURACY_VALUES)?.medianAchievement).toBe(1000000);
  });

  it('targets the lowest grade that enters the best pool without peer data', () => {
    expect(unplayedRatingFloors(best, 13)).toEqual({ new: 292, old: 292 });
    const [rec, ...rest] = generateUnplayedRecommendations([chart('a', 135, 13), chart('low', 120, 13), chart('u', 150, 13, 'utage')], best, 13);
    expect(rest).toHaveLength(0);
    expect(rec).toMatchObject({ targetAccuracy: 100.5, neededAccuracy: 100.5, targetRating: 303, replacedRating: 292, ratingGain: 11, category: 'new', peerMedianAccuracy: null, peerReach: null, stretch: false });
  });

  it('aims for the grade peers usually reach and flags targets above it as a stretch', () => {
    const peers: Record<string, RecommendationPeers> = {
      // SSS gives 289, below the 292 floor, so only SSS+ (+9) helps, while peers usually score 100.05%
      stretch: { peerCount: 100, reachShares: { 100: 0.6, 100.5: 0.35 }, medianAchievement: 1000500 },
      usual: { peerCount: 100, reachShares: { 100: 0.9, 100.5: 0.2 }, medianAchievement: 1003000 },
    };
    const result = generateUnplayedRecommendations([chart('stretch', 134, 1), chart('usual', 139, 1)], best, 13, peers);
    expect(result.map(rec => rec.song.songId)).toEqual(['usual', 'stretch']);
    expect(result[0]).toMatchObject({ targetAccuracy: 100, ratingGain: 8, peerMedianAccuracy: 100.3, peerReach: 0.9, stretch: false, category: 'old' });
    expect(result[1]).toMatchObject({ targetAccuracy: 100.5, ratingGain: 9, peerMedianAccuracy: 100.05, peerReach: 0.35, stretch: true });
  });

  it('falls back to the player\'s own scores on similar levels and ranks charts without evidence last', () => {
    const own = addRatingsAndSort(Array.from({ length: 5 }, (_, i) => ({ ...played(`p${i}`, 13), levelPrecise: 120, achievement: 970000 })), 13);
    // far has the larger raw gain (236 vs 232) but nothing backs its 94% target
    const result = generateUnplayedRecommendations([chart('far', 150, 13), chart('near', 120, 13)], own, 13);
    expect(result.map(rec => rec.song.songId)).toEqual(['near', 'far']);
    expect(result[0]).toMatchObject({ targetAccuracy: 97, targetRating: 232, peerMedianAccuracy: null });
    expect(result[1]).toMatchObject({ targetAccuracy: 94, targetRating: 236 });
  });

  it('counts the full chart rating while the pool is not full', () => {
    expect(unplayedRatingFloors([], 13)).toEqual({ new: 0, old: 0 });
    const [rec] = generateUnplayedRecommendations([chart('a', 135, 13)], [], 13);
    expect(rec).toMatchObject({ targetAccuracy: 94, replacedRating: 0, ratingGain: rec.targetRating });
  });
});
