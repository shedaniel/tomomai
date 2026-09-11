import type { PercentileBucket, RatingScoreBucket } from './percentile-types';

export function achievementRange(scores: number[], userAchievement: number, fullRange: boolean) {
  const minimum = Math.min(userAchievement, ...scores);
  return {
    min: Math.max(0, Math.floor((fullRange ? minimum : Math.min(970000, userAchievement)) / 10000) * 10000),
    max: Math.max(1010000, userAchievement),
  };
}

/** Repeated x coordinates preserve ties as vertical steps, without smoothing. */
export function cumulativePoints(distribution: PercentileBucket[], min: number, max: number) {
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  if (!total) return [];
  let cumulative = distribution.reduce((sum, bucket) => sum + (bucket.lo < min ? bucket.count : 0), 0);
  const points = [{ score: min, percent: cumulative / total * 100 }];
  for (const bucket of distribution) {
    if (bucket.lo < min || bucket.lo > max) continue;
    points.push({ score: bucket.lo, percent: cumulative / total * 100 });
    cumulative += bucket.count;
    points.push({ score: bucket.lo, percent: Math.min(100, cumulative / total * 100) });
  }
  points.push({ score: max, percent: Math.min(100, cumulative / total * 100) });
  return points;
}

export function shareAtOrBelow(distribution: PercentileBucket[], achievement: number) {
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const count = distribution.reduce((sum, bucket) => sum + (bucket.lo <= achievement ? bucket.count : 0), 0);
  return total ? Math.min(1, count / total) : 0;
}

export function cumulativeLabel(share: number) {
  const percent = Math.max(0, Math.min(100, share * 100));
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

export function peerRankLabel(shareBelow: number, shareAtOrBelow: number) {
  const format = (share: number) => share < 0.01 ? '<1%' : cumulativeLabel(share);
  if (shareBelow >= 0.5) return `Top ${format(1 - shareBelow)}`;
  if (shareAtOrBelow <= 0.5) return `Bottom ${format(shareAtOrBelow)}`;
  return 'Around median';
}

/** Stable offsets reveal overlapping bins without implying exact player ratings. */
export function ratingClusterPosition(point: RatingScoreBucket) {
  const fraction = (seed: number) => {
    let hash = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  };
  const seed = Math.imul(point.ratingLo, 31) + point.achievementLo;
  return {
    rating: point.ratingLo + 125 * (0.05 + 0.9 * fraction(seed)),
    achievement: Math.min(1010000, point.achievementLo + 1000 * (0.05 + 0.9 * fraction(seed ^ 0x9e3779b9))),
  };
}
