import { GAME_CODES } from "./codes";
import type { GamePlayerScore, GameSnapshotData } from "./player-view";
import { formatGameScore } from "./presentation";
import { rankScores } from "./ranking";
import { getGame } from "./registry";
import type { RecommendationTarget } from "./types";
import type { CanonicalGameId } from "./ids";

/** How many of a chart's peers reached each score target, keyed by the target's score. */
export interface RecommendationPeers {
  peerCount: number;
  reachShares: Record<string, number>;
  /** The weighted median of the peers' best scores. */
  medianScore: number;
}

/** The peer evidence that ranks played charts. */
export type RecommendationPeerReach = Pick<RecommendationPeers, "peerCount" | "reachShares">;

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
  isHighValue: boolean;
  order: number;
}

// Effort is the score distance in percent of 1,000,000, and a closer target still counts as 0.1.
const SCORE_PER_EFFORT = 10_000;
const MIN_EFFORT = 0.1;

/** Fewer peers than this carry no evidence. */
export const MIN_RECOMMENDATION_PEERS = 30;

function weighByPeers(efficiency: number, promotable: boolean, target: RecommendationTarget, peers: RecommendationPeerReach | undefined) {
  // Peers report only their best scores, so a combo target has no reach share.
  const share = target.kind === "score" ? peers?.reachShares[target.scoreValue] : undefined;
  if (!peers || peers.peerCount < MIN_RECOMMENDATION_PEERS || share == null || !Number.isFinite(share)) {
    return { efficiencyScore: efficiency, peerReach: null, peerWeight: 1 };
  }
  // Shrink sparse samples toward the original ranking. Peer bests are not success probabilities.
  const confidence = peers.peerCount / (peers.peerCount + 50);
  const weight = 16 ** (confidence * (2 * Math.max(0, Math.min(1, share)) - 1));
  const peerWeight = promotable ? weight : Math.min(1, weight);
  return { efficiencyScore: efficiency * peerWeight, peerReach: share, peerWeight };
}

function rankSnapshot(data: GameSnapshotData) {
  const { game, gameVersion: version } = data.snapshot;
  const definition = getGame(game);
  const { rating } = definition;
  const ranked = rankScores(game, data.songs.filter(song => rating.isRated(song.difficultyCode)), version);
  const bestRatings = [...ranked.newScores, ...ranked.oldScores].map(song => song.rating);
  const buckets = {
    new: { category: "new", selected: ranked.newScores, remaining: ranked.newRemaining, offset: 0 },
    old: { category: "old", selected: ranked.oldScores, remaining: ranked.oldRemaining, offset: ranked.newScores.length },
  } as const;
  // A selection is ordered by rating, so a chart entering a full bucket displaces its last chart.
  const displaced = (category: "new" | "old") => {
    const { selected, offset } = buckets[category];
    return selected.length < rating.bucketSizes[category] ? null : offset + selected.length - 1;
  };
  return { game, version, definition, ranked, bestRatings, playerRating: rating.playerRating(bestRatings), buckets, displaced };
}

/** The player rating gain of one chart rated `targetRating` taking the place of `replaced`, or joining a bucket that is not full. */
function playerRatingGain(context: ReturnType<typeof rankSnapshot>, replaced: number | null, targetRating: number) {
  const nextRatings = [...context.bestRatings];
  if (replaced == null) nextRatings.push(targetRating);
  else nextRatings[replaced] = targetRating;
  return context.definition.rating.playerRating(nextRatings) - context.playerRating;
}

export function generateRecommendations(data: GameSnapshotData, peers: Readonly<Record<string, RecommendationPeerReach>> = {}): RecommendationData[] {
  const context = rankSnapshot(data);
  const { version, definition: { rating, recommendations }, bestRatings } = context;
  const targets = recommendations.targets(version);
  const results: RecommendationData[] = [];

  for (const { category, selected, remaining, offset } of Object.values(context.buckets)) {
    const displaced = context.displaced(category);
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
        const ratingGain = playerRatingGain(context, replaced, targetRating);
        if (ratingGain <= 0) continue;
        const chartGain = targetRating - (replaced == null ? 0 : bestRatings[replaced]);
        const efficiency = target.kind === "combo"
          ? target.efficiency
          : chartGain / Math.max((target.scoreValue - song.scoreValue) / SCORE_PER_EFFORT, MIN_EFFORT);
        const weighted = weighByPeers(efficiency, chartGain >= recommendations.minPromotedChartGain, target, peers[song.songId]);
        results.push({
          song, target, targetRating, ratingGain, isInBest, category, efficiency, ...weighted,
          hasPotential: weighted.peerWeight >= 1.1, isHighValue: ratingGain >= recommendations.highValueRatingGain, order: order++,
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

/** A catalog chart the player has no score on. */
export type RecommendationChart = Pick<GamePlayerScore,
  "songId" | "songName" | "artist" | "cover" | "genre" | "level" | "levelPrecise" | "addedVersion" | "difficultyCode" | "typeCode">;

export interface UnplayedRecommendationData {
  song: RecommendationChart;
  /** The best score target peers, or the player on similar levels, usually reach, and never below `neededTarget`. */
  target: RecommendationTarget;
  /** The lowest score target that raises the player rating. */
  neededTarget: RecommendationTarget;
  targetRating: number;
  /** The rating of the chart this one would displace, 0 while its bucket is not full. */
  replacedRating: number;
  ratingGain: number;
  category: "new" | "old";
  peerCount: number | null;
  peerMedianScore: number | null;
  /** The share of nearby peers whose best reaches the target. */
  peerReach: number | null;
  /** The target is above what peers, or the player on similar levels, usually score. */
  stretch: boolean;
  /** The chart rating gain weighted by the estimated chance of reaching the target. */
  score: number;
}

/** The difficulties whose charts count toward the player rating. */
export function ratedDifficultyCodes(game: CanonicalGameId): number[] {
  const { rating } = getGame(game);
  return GAME_CODES[game].difficulty.map((_, code) => code).filter(code => rating.isRated(code));
}

/** Peers report only their best scores, so unplayed charts aim for score targets alone. */
function scoreTargets(game: CanonicalGameId, version: number) {
  return getGame(game).recommendations.targets(version).filter(target => target.kind === "score");
}

/** The rating a new chart must beat to enter each bucket: its last chart's, or 0 while it is not full. */
export function unplayedRatingFloors(data: GameSnapshotData): Record<"new" | "old", number> {
  const context = rankSnapshot(data);
  const floor = (category: "new" | "old") => {
    const displaced = context.displaced(category);
    return displaced == null ? 0 : context.bestRatings[displaced];
  };
  return { new: floor("new"), old: floor("old") };
}

const MAX_LEVEL_PRECISE = 1000;

/** The lowest level whose top score target still rates above `floor`. Charts below it can never enter a bucket. */
export function minUsefulLevelPrecise(game: CanonicalGameId, version: number, floor: number): number {
  const top = scoreTargets(game, version).at(-1);
  const [difficultyCode] = ratedDifficultyCodes(game);
  if (!top || difficultyCode == null) return MAX_LEVEL_PRECISE + 1;
  const { rating } = getGame(game);
  const beatsFloor = (levelPrecise: number) => Math.floor(rating.chartRating({
    scoreValue: top.scoreValue, levelPrecise, difficultyCode, comboStatus: top.comboStatus,
  }, version)) > floor;
  let lo = 0;
  let hi = MAX_LEVEL_PRECISE + 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beatsFloor(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// A reach share from a small sample is pulled toward 50%, as if a few extra players split evenly.
const REACH_PRIOR_SAMPLES = 4;
const NO_EVIDENCE_REACH = 0.25;
// Levels are stored ×10, so this is ±0.3.
const SIMILAR_LEVEL_RANGE = 3;
const MIN_SIMILAR_SCORES = 5;

function shrunkReach(share: number, sampleSize: number) {
  return (share * sampleSize + 0.5 * REACH_PRIOR_SAMPLES) / (sampleSize + REACH_PRIOR_SAMPLES);
}

/** The player's own scores on rated charts of a similar level, ascending, when they have played enough of them. */
function ownSimilarScores(songs: readonly GamePlayerScore[], levelPrecise: number): number[] | null {
  const scores = songs
    .filter(song => Math.abs(song.levelPrecise - levelPrecise) <= SIMILAR_LEVEL_RANGE)
    .map(song => song.scoreValue)
    .sort((a, b) => a - b);
  return scores.length < MIN_SIMILAR_SCORES ? null : scores;
}

export function generateUnplayedRecommendations(
  data: GameSnapshotData,
  candidates: readonly RecommendationChart[],
  peers: Readonly<Record<string, RecommendationPeers>> = {},
): UnplayedRecommendationData[] {
  const context = rankSnapshot(data);
  const { game, version, definition: { rating }, ranked, bestRatings } = context;
  const targets = scoreTargets(game, version);
  const results: UnplayedRecommendationData[] = [];

  for (const song of candidates) {
    if (!rating.isRated(song.difficultyCode)) continue;
    const category = rating.isNew(song.addedVersion, version) ? "new" : "old";
    const replaced = context.displaced(category);
    const replacedRating = replaced == null ? 0 : bestRatings[replaced];
    const options = targets.map(target => {
      const targetRating = Math.floor(rating.chartRating({
        scoreValue: target.scoreValue, levelPrecise: song.levelPrecise,
        difficultyCode: song.difficultyCode, comboStatus: target.comboStatus,
      }, version));
      return { target, targetRating, ratingGain: playerRatingGain(context, replaced, targetRating) };
    });
    const needed = options.find(option => option.ratingGain > 0);
    if (!needed) continue;

    const chartPeers = (peers[song.songId]?.peerCount ?? 0) >= MIN_RECOMMENDATION_PEERS ? peers[song.songId] : undefined;
    const peerMedianScore = chartPeers?.medianScore ?? null;
    const own = chartPeers ? null : ownSimilarScores(ranked.rated, song.levelPrecise);
    const expected = peerMedianScore ?? (own ? own[Math.floor((own.length - 1) / 2)] : null);
    const chosen = expected != null && expected >= needed.target.scoreValue
      ? options.filter(option => option.target.scoreValue <= expected).at(-1)!
      : needed;

    const peerReach = chartPeers?.reachShares[chosen.target.scoreValue] ?? null;
    const reach = chartPeers && peerReach != null
      ? shrunkReach(peerReach, chartPeers.peerCount)
      : own
        ? shrunkReach(own.filter(score => score >= chosen.target.scoreValue).length / own.length, own.length)
        : NO_EVIDENCE_REACH;
    results.push({
      song,
      target: chosen.target,
      neededTarget: needed.target,
      targetRating: chosen.targetRating,
      replacedRating,
      ratingGain: chosen.ratingGain,
      category,
      peerCount: chartPeers?.peerCount ?? null,
      peerMedianScore,
      peerReach,
      stretch: expected != null && expected < chosen.target.scoreValue,
      score: (chosen.targetRating - replacedRating) * reach,
    });
  }

  return results.sort((a, b) => b.score - a.score || b.ratingGain - a.ratingGain);
}
