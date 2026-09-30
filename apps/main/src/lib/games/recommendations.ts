import type { GamePlayerScore, GameSnapshotData } from "./player-view";
import { formatGameScore } from "./presentation";
import { rankScores } from "./ranking";
import { getGame } from "./registry";
import type { CanonicalGameId, RecommendationTarget } from "./types";

/** How many of a chart's peers reached each score target, keyed by the target's score. */
export interface RecommendationPeers {
  peerCount: number;
  reachShares: Record<string, number>;
}

export interface RecommendationData {
  song: GamePlayerScore & { rating: number };
  target: RecommendationTarget;
  targetRating: number;
  /** How much the player rating rises when the chart reaches the target. */
  ratingGain: number;
  isInBest: boolean;
  category: "new" | "old";
  efficiency: number;
  efficiencyScore: number;
  peerReach: number | null;
  peerWeight: number;
  hasPotential: boolean;
  order: number;
}

// Effort is the score distance in percent of 1,000,000, and a closer target still counts as 0.1.
const SCORE_PER_EFFORT = 10_000;
const MIN_EFFORT = 0.1;
const MIN_PEERS = 30;

function weighByPeers(efficiency: number, chartGain: number, target: RecommendationTarget, peers: RecommendationPeers | undefined) {
  // Peers report only their best scores, so a combo target has no reach share.
  const share = target.kind === "score" ? peers?.reachShares[target.scoreValue] : undefined;
  if (!peers || peers.peerCount < MIN_PEERS || share == null || !Number.isFinite(share)) {
    return { efficiencyScore: efficiency, peerReach: null, peerWeight: 1 };
  }
  // Shrink sparse samples toward the original ranking. Peer bests are not success probabilities.
  const confidence = peers.peerCount / (peers.peerCount + 50);
  const weight = 16 ** (confidence * (2 * Math.max(0, Math.min(1, share)) - 1));
  const peerWeight = chartGain < 3 ? Math.min(1, weight) : weight;
  return { efficiencyScore: efficiency * peerWeight, peerReach: share, peerWeight };
}

export function generateRecommendations(data: GameSnapshotData, peers: Readonly<Record<string, RecommendationPeers>> = {}): RecommendationData[] {
  const { game, gameVersion: version } = data.snapshot;
  const { rating, recommendations } = getGame(game);
  const ranked = rankScores(game, data.songs.filter(song => rating.isRated(song.difficultyCode)), version);
  const bestRatings = [...ranked.newScores, ...ranked.oldScores].map(song => song.rating);
  const playerRating = rating.playerRating(bestRatings);
  const targets = recommendations.targets(version);
  const buckets = [
    { category: "new", selected: ranked.newScores, remaining: ranked.newRemaining, offset: 0 },
    { category: "old", selected: ranked.oldScores, remaining: ranked.oldRemaining, offset: ranked.newScores.length },
  ] as const;
  const results: RecommendationData[] = [];

  for (const { category, selected, remaining, offset } of buckets) {
    // A selection is ordered by rating, so a chart entering a full bucket displaces its last chart.
    const displaced = selected.length < rating.bucketSizes[category] ? null : offset + selected.length - 1;
    [...selected, ...remaining].forEach((song, index) => {
      const isInBest = index < selected.length;
      const replaced = isInBest ? offset + index : displaced;
      let order = 0;
      for (const target of targets) {
        const targetRating = Math.floor(rating.chartRating({
          scoreValue: target.scoreValue, levelPrecise: song.levelPrecise,
          difficultyCode: song.difficultyCode, comboStatus: target.comboStatus,
        }, version));
        if (targetRating <= song.rating) continue;
        const nextRatings = [...bestRatings];
        if (replaced == null) nextRatings.push(targetRating);
        else nextRatings[replaced] = targetRating;
        const ratingGain = rating.playerRating(nextRatings) - playerRating;
        if (ratingGain <= 0) continue;
        const chartGain = targetRating - (replaced == null ? 0 : bestRatings[replaced]);
        const efficiency = target.kind === "combo"
          ? target.efficiency
          : chartGain / Math.max((target.scoreValue - song.scoreValue) / SCORE_PER_EFFORT, MIN_EFFORT);
        const weighted = weighByPeers(efficiency, chartGain, target, peers[song.songId]);
        results.push({
          song, target, targetRating, ratingGain, isInBest, category, efficiency, ...weighted,
          hasPotential: weighted.peerWeight >= 1.1, order: order++,
        });
      }
    });
  }
  return results.sort((a, b) => a.order - b.order || (Math.abs(a.efficiencyScore - b.efficiencyScore) < 0.1
    ? b.ratingGain - a.ratingGain : b.efficiencyScore - a.efficiencyScore));
}

/** A combo target reads as its label, and a score target as its score. */
export function formatRecommendationTarget(game: CanonicalGameId, target: RecommendationTarget): string {
  return target.kind === "combo" ? target.label : formatGameScore(game, target.scoreValue, { precision: "compact" });
}
