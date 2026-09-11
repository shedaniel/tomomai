import { describe, expect, it } from 'vitest';
import { achievementRange, cumulativeLabel, ratingClusterPosition, cumulativePoints, shareAtOrBelow, peerRankLabel } from './percentile-chart';

describe('score comparison geometry', () => {
  it('keeps a 99.5720% score on the achievement axis even beyond all peers', () => {
    expect(achievementRange([940000, 960000], 995720, false)).toEqual({ min: 970000, max: 1010000 });
    expect(achievementRange([980000], 930000, false).min).toBe(930000);
    expect(achievementRange([0, 1005000], 995720, true).min).toBe(0);
  });

  it('draws exact steps with ties included at each threshold', () => {
    expect(cumulativePoints([{ lo: 990000, count: 30 }, { lo: 1000000, count: 10 }], 970000, 1010000)).toEqual([
      { score: 970000, percent: 0 },
      { score: 990000, percent: 0 }, { score: 990000, percent: 75 },
      { score: 1000000, percent: 75 }, { score: 1000000, percent: 100 },
      { score: 1010000, percent: 100 },
    ]);
  });

  it('retains the full denominator when lower scores are outside the view', () => {
    const points = cumulativePoints([{ lo: 900000, count: 30 }, { lo: 1000000, count: 10 }], 970000, 1010000);
    expect(points[0]).toEqual({ score: 970000, percent: 75 });
    expect(points.every(point => point.score >= 970000 && point.percent >= 0)).toBe(true);
    expect(cumulativePoints([], 970000, 1010000)).toEqual([]);
  });

  it('places the marker at the inclusive cumulative share, including ties and extremes', () => {
    const distribution = [{ lo: 990000, count: 30 }, { lo: 1000000, count: 10 }];
    expect(shareAtOrBelow(distribution, 980000)).toBe(0);
    expect(shareAtOrBelow(distribution, 990000)).toBe(0.75);
    expect(shareAtOrBelow(distribution, 995720)).toBe(0.75);
    expect(shareAtOrBelow(distribution, 1000000)).toBe(1);
    expect(shareAtOrBelow(distribution, 1010000)).toBe(1);
    expect(shareAtOrBelow([], 995720)).toBe(0);
  });

  it('does not round a small nonzero share to zero', () => {
    expect(cumulativeLabel(0.001)).toBe('<1%');
    expect(cumulativeLabel(1)).toBe('100%');
    expect(cumulativeLabel(0)).toBe('0%');
    expect(cumulativeLabel(0.75)).toBe('75%');
  });
});

describe('rating cluster positions', () => {
  it('spreads bins reproducibly without moving them outside their known ranges', () => {
    const ratings = new Set<number>();
    for (let achievementLo = 970000; achievementLo <= 1010000; achievementLo += 1000) {
      const point = { ratingLo: 15000, achievementLo, count: 4 };
      const position = ratingClusterPosition(point);
      expect(ratingClusterPosition(point)).toEqual(position);
      expect(position.rating).toBeGreaterThanOrEqual(15000);
      expect(position.rating).toBeLessThan(15125);
      expect(position.achievement).toBeGreaterThanOrEqual(achievementLo);
      expect(position.achievement).toBeLessThanOrEqual(Math.min(1010000, achievementLo + 1000));
      ratings.add(position.rating);
    }
    expect(ratings.size).toBe(41);
  });
});

describe('peer rank labels', () => {
  it('includes ties in top and bottom groups', () => {
    expect(peerRankLabel(0.8, 0.85)).toBe('Top 20%');
    expect(peerRankLabel(0.15, 0.2)).toBe('Bottom 20%');
    expect(peerRankLabel(0.4, 0.6)).toBe('Around median');
    expect(peerRankLabel(0, 1)).toBe('Around median');
  });

  it('avoids zero-percent ranks at either extreme', () => {
    expect(peerRankLabel(1, 1)).toBe('Top <1%');
    expect(peerRankLabel(0, 0)).toBe('Bottom <1%');
  });
});
