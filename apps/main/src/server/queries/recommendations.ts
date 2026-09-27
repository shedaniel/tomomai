import { recommendationEfficiency, type RecommendationPeers } from "@/lib/recommendation-potential";
import { getPlayerRankings, type GameSnapshotData, type GamePlayerScore } from "@/lib/games/player-view";
import { GAME_RANKING_SIZES } from "@/lib/games/rating";
import { getGameChartRating, getGameChartTypeKey, getGameDifficultyKey, getGameScoreBenchmarks } from "@/lib/games/presentation";

export interface RecommendationData {
  song: GamePlayerScore & { difficulty: string; type: string };
  currentScore: number;
  targetScore: number;
  currentRating: number;
  targetRating: number;
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

export const ACCURACY_VALUES = [94, 97, 98, 99, 99.5, 100, 100.5, 101];

export function generateRecommendations(data: GameSnapshotData, peers: Record<string, RecommendationPeers> = {}): RecommendationData[] {
  const { game, gameVersion: version } = data.snapshot;
  // Special charts do not contribute to either game's rating.
  const rankings = getPlayerRankings(game, { ...data, songs: data.songs.filter(song => song.difficultyCode !== 5) });
  const sizes = GAME_RANKING_SIZES[game];
  const best = [...rankings.newScores, ...rankings.oldScores];
  const currentSum = best.reduce((sum, song) => sum + song.rating, 0);
  const targets = game === "maimai"
    ? ACCURACY_VALUES.filter(value => version >= 12 || value !== 101).map(value => value * 10000)
    : getGameScoreBenchmarks(game).map(target => target.scoreValue).sort((a, b) => a - b);
  const recommendations: RecommendationData[] = [];

  for (const category of ["new", "old"] as const) {
    const selected = category === "new" ? rankings.newScores : rankings.oldScores;
    const remaining = category === "new" ? rankings.newRemaining : rankings.oldRemaining;
    const minimum = selected.length === 0 || (game === "chunithm" && selected.length < sizes[category])
      ? 0 : Math.min(...selected.map(song => song.rating));
    const selectedIds = new Set(selected.map(song => song.songId));
    for (const score of [...selected, ...remaining]) {
      const isInBest = selectedIds.has(score.songId);
      const currentScore = score.scoreValue;
      if (game === "maimai" && currentScore >= 1005000 && (version < 12 || score.comboStatus >= 3)) continue;
      let order = 0;
      for (const targetScore of targets) {
        if (targetScore <= currentScore) continue;
        const isAp = game === "maimai" && targetScore === 1010000;
        const targetRating = Math.floor(getGameChartRating(game, isAp ? 1005000 : targetScore, score.levelPrecise, score.difficultyCode, isAp ? 3 : 0, version));
        if (targetRating <= minimum) continue;
        const chartGain = targetRating - (isInBest ? score.rating : minimum);
        const ratingGain = game === "chunithm"
          ? Math.floor((currentSum + chartGain) / (sizes.new + sizes.old)) - Math.floor(currentSum / (sizes.new + sizes.old))
          : chartGain;
        if (ratingGain <= 0) continue;
        const effort = (targetScore - currentScore) / 10000;
        const efficiency = isAp ? 2 : chartGain / Math.max(effort, 0.1);
        const peerScore = recommendationEfficiency(efficiency, chartGain, targetScore / 10000, peers[score.songId]);
        recommendations.push({
          song: { ...score, difficulty: getGameDifficultyKey(game, score.difficultyCode), type: getGameChartTypeKey(game, score.typeCode) },
          currentScore, targetScore, currentRating: score.rating, targetRating, ratingGain, isInBest, category,
          efficiency, ...peerScore, hasPotential: peerScore.peerWeight >= 1.1, order: order++,
        });
      }
    }
  }
  return recommendations.sort((a, b) => a.order - b.order || (Math.abs(a.efficiencyScore - b.efficiencyScore) < 0.1
    ? b.ratingGain - a.ratingGain : b.efficiencyScore - a.efficiencyScore));
}
