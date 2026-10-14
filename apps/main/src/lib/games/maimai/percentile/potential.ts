import { MIN_RECOMMENDATION_PEERS, type RecommendationPeers } from '@/lib/games/recommendations';
import { MAIMAI_SCORE_TARGETS } from '../recommendations';
import type { PercentileEntry } from './types';

export function recommendationPeers(data: PercentileEntry): RecommendationPeers | null {
  if (data.percentile == null || data.peerCount < MIN_RECOMMENDATION_PEERS) return null;
  const total = data.distribution.reduce((sum, point) => sum + point.count, 0);
  if (total <= 0) return null;
  return {
    peerCount: data.peerCount,
    reachShares: Object.fromEntries(MAIMAI_SCORE_TARGETS.map(({ scoreValue }) => [
      scoreValue,
      data.distribution.reduce((sum, point) => sum + (point.lo >= scoreValue ? point.count : 0), 0) / total,
    ])),
  };
}
