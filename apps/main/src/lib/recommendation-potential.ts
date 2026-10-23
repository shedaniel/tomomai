import type { PercentileEntry } from './percentile-types';

export interface RecommendationPeers {
  peerCount: number;
  reachShares: Record<string, number>;
  /** Weighted median of peer best scores (×10000). */
  medianAchievement: number;
}

export function recommendationPeers(data: PercentileEntry, targets: number[]): RecommendationPeers | null {
  if (data.percentile == null || data.peerCount < 30) return null;
  const total = data.distribution.reduce((sum, point) => sum + point.count, 0);
  if (total <= 0) return null;
  let cumulative = 0;
  const median = data.distribution.find(point => (cumulative += point.count) >= total / 2)?.lo ?? 0;
  return {
    peerCount: data.peerCount,
    reachShares: Object.fromEntries(targets.filter(target => target < 101).map(target => [
      target,
      data.distribution.reduce((sum, point) => sum + (point.lo >= Math.round(target * 10000) ? point.count : 0), 0) / total,
    ])),
    medianAchievement: median,
  };
}

export function recommendationEfficiency(baseEfficiency: number, ratingGain: number, target: number, peers?: Pick<RecommendationPeers, 'peerCount' | 'reachShares'>) {
  const share = peers?.reachShares[target];
  if (!peers || peers.peerCount < 30 || target >= 101 || share == null || !Number.isFinite(share)) {
    return { efficiencyScore: baseEfficiency, peerReach: null, peerWeight: 1 };
  }
  // Shrink sparse samples toward the original ranking; peer bests are not success probabilities.
  const confidence = peers.peerCount / (peers.peerCount + 50);
  const weight = 16 ** (confidence * (2 * Math.max(0, Math.min(1, share)) - 1));
  const peerWeight = ratingGain < 3 ? Math.min(1, weight) : weight;
  return { efficiencyScore: baseEfficiency * peerWeight, peerReach: share, peerWeight };
}
