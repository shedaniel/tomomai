import { recommendationEfficiency, type RecommendationPeers } from "@/lib/recommendation-potential";
import { getRatingFactor, SongWithRating, splitSongs } from "@/lib/rating-calculator";
import type { SongBase } from "@/lib/types";

type PeerReach = Pick<RecommendationPeers, "peerCount" | "reachShares">;

export interface RecommendationData {
  song: SongWithRating;
  currentAccuracy: number;
  targetAccuracy: number;
  currentRating: number;
  targetRating: number;
  accuracyDiff: number;
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

export const ACCURACY_VALUES = [
  94.0,
  97.0,
  98.0,
  99.0,
  99.5,
  100.0,
  100.5,
  101.0,
];

export function generateRecommendations(songsWithRating: SongWithRating[], version: number, peers: Record<string, PeerReach> = {}): RecommendationData[] {
  const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsWithRating, version);

  const minNewRating = newSongsB15.length > 0 ? Math.min(...newSongsB15.map(s => s.rating)) : 0;
  const minOldRating = oldSongsB35.length > 0 ? Math.min(...oldSongsB35.map(s => s.rating)) : 0;

  const recommendations: RecommendationData[] = [];

  const newSongsB15Tuple = newSongsB15.map(song => ({ song, isNew: true }));
  const oldSongsB35Tuple = oldSongsB35.map(song => ({ song, isNew: false }));
  const newSongsRemainingTuple = newSongsRemaining.map(song => ({ song, isNew: true }));
  const oldSongsRemainingTuple = oldSongsRemaining.map(song => ({ song, isNew: false }));

  [...newSongsB15Tuple, ...oldSongsB35Tuple, ...newSongsRemainingTuple, ...oldSongsRemainingTuple].forEach(({ song, isNew }) => {
    // utage charts never contribute rating; recommending them would show a fake rating gain
    if (song.difficulty === "utage") return;

    const isInB15 = isNew && newSongsB15.some(s => s.songId === song.songId && s.difficulty === song.difficulty);
    const isInB35 = !isNew && oldSongsB35.some(s => s.songId === song.songId && s.difficulty === song.difficulty);
    const isInBest = isInB15 || isInB35;

    const currentAccuracy = song.achievement / 10000;
    const minRequiredRating = isNew ? minNewRating : minOldRating;

    if (version >= 12) {
      if (currentAccuracy >= 100.5 && (song.fc === "ap" || song.fc === "ap+")) return;
    } else {
      if (currentAccuracy >= 100.5) return;
    }

    if (!isInBest) {
      const extra = version >= 12 ? 1 : 0;
      const maxPossibleRating = Math.floor(0.224 * 100.5 * song.levelPrecise / 10) + extra;
      if (maxPossibleRating <= minRequiredRating) return;
    }

    let order = 0;

    for (const accuracy of ACCURACY_VALUES) {
      if (accuracy <= currentAccuracy) continue;
      if (version < 12 && accuracy === 101.0) continue;

      const factor = getRatingFactor(accuracy);
      const extra = version >= 12 && accuracy === 101.0 ? 1 : 0;
      const newRating = Math.floor(factor * Math.min(accuracy, 100.5) * song.levelPrecise / 10) + extra;

      if (newRating <= minRequiredRating) continue;

      const ratingGain = isInBest
        ? newRating - song.rating
        : newRating - minRequiredRating;

      if (ratingGain <= 0) continue;

      const efficiency = accuracy === 101.0
        ? 2.0
        : ratingGain / Math.max(accuracy - currentAccuracy, 0.1);

      const peerScore = recommendationEfficiency(efficiency, ratingGain, accuracy, peers[song.songId]);
      recommendations.push({
        song,
        currentAccuracy,
        targetAccuracy: accuracy,
        accuracyDiff: accuracy - currentAccuracy,
        currentRating: song.rating,
        targetRating: newRating,
        ratingGain,
        isInBest,
        category: isNew ? "new" : "old",
        efficiency,
        ...peerScore,
        hasPotential: peerScore.peerWeight >= 1.1,
        order,
      });

      order++;
    }
  });

  return recommendations.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    if (Math.abs(a.efficiencyScore - b.efficiencyScore) < 0.1) {
      return b.ratingGain - a.ratingGain;
    }
    return b.efficiencyScore - a.efficiencyScore;
  });
}

export interface UnplayedRecommendationData {
  song: SongBase;
  /** Grade to aim for: the best grade peers (or the player, on similar levels) typically reach, or the lowest grade that enters B15/B35. */
  targetAccuracy: number;
  neededAccuracy: number;
  targetRating: number;
  /** Rating of the B15/B35 entry this chart would replace (0 while the pool is not full). */
  replacedRating: number;
  ratingGain: number;
  category: "new" | "old";
  peerCount: number | null;
  peerMedianAccuracy: number | null;
  /** Share of nearby peers whose best reaches the target. */
  peerReach: number | null;
  /** The target is above what peers (or the player, on similar levels) typically score. */
  stretch: boolean;
  /** ratingGain weighted by the estimated chance of reaching the target. */
  score: number;
}

const UNPLAYED_GRADES = ACCURACY_VALUES.filter(accuracy => accuracy < 101);

function ratingAt(accuracy: number, levelPrecise: number) {
  return Math.floor(getRatingFactor(accuracy) * Math.min(accuracy, 100.5) * levelPrecise / 10);
}

export function unplayedRatingFloors(songsWithRating: SongWithRating[], version: number) {
  const { newSongsB15, oldSongsB35 } = splitSongs(songsWithRating, version);
  return {
    new: newSongsB15.length < 15 ? 0 : Math.min(...newSongsB15.map(s => s.rating)),
    old: oldSongsB35.length < 35 ? 0 : Math.min(...oldSongsB35.map(s => s.rating)),
  };
}

export function isNewSong(addedVersion: number, version: number) {
  // Since version 12, the previous version's songs also count as new
  return addedVersion >= (version >= 12 ? version - 1 : version);
}

/** Lowest chart constant (×10) whose SSS+ could still beat the given floor. */
export function minUsefulLevelPrecise(floor: number) {
  return Math.floor(floor * 10 / (0.224 * 100.5));
}

// A reach share from a small sample is pulled toward 50%, as if a few extra players split evenly
const REACH_PRIOR_SAMPLES = 4;
const NO_EVIDENCE_REACH = 0.25;

function shrunkReach(share: number, sampleSize: number) {
  return (share * sampleSize + 0.5 * REACH_PRIOR_SAMPLES) / (sampleSize + REACH_PRIOR_SAMPLES);
}

/** The player's own accuracies on charts within ±0.3 of a level, when they have played enough of them. */
function ownSimilarAccuracies(songsWithRating: SongWithRating[], levelPrecise: number): number[] | null {
  const accuracies = songsWithRating
    .filter(song => song.difficulty !== "utage" && Math.abs(song.levelPrecise - levelPrecise) <= 3)
    .map(song => song.achievement / 10000)
    .sort((a, b) => a - b);
  return accuracies.length < 5 ? null : accuracies;
}

export function generateUnplayedRecommendations(
  candidates: SongBase[],
  songsWithRating: SongWithRating[],
  version: number,
  peers: Record<string, RecommendationPeers> = {},
): UnplayedRecommendationData[] {
  const floors = unplayedRatingFloors(songsWithRating, version);
  const recommendations: UnplayedRecommendationData[] = [];

  for (const song of candidates) {
    if (song.difficulty === "utage") continue;
    const category = isNewSong(song.addedVersion, version) ? "new" : "old";
    const floor = floors[category];
    const neededAccuracy = UNPLAYED_GRADES.find(accuracy => ratingAt(accuracy, song.levelPrecise) > floor);
    if (neededAccuracy == null) continue;

    const chartPeers = peers[song.songId];
    const peerMedianAccuracy = chartPeers ? chartPeers.medianAchievement / 10000 : null;
    const own = chartPeers ? null : ownSimilarAccuracies(songsWithRating, song.levelPrecise);
    const expectedAccuracy = peerMedianAccuracy ?? (own ? own[Math.floor((own.length - 1) / 2)] : null);
    const targetAccuracy = expectedAccuracy != null && expectedAccuracy >= neededAccuracy
      ? UNPLAYED_GRADES.filter(accuracy => accuracy <= expectedAccuracy).at(-1)!
      : neededAccuracy;
    const targetRating = ratingAt(targetAccuracy, song.levelPrecise);
    const ratingGain = targetRating - floor;

    const peerReach = chartPeers?.reachShares[targetAccuracy] ?? null;
    const reach = peerReach != null
      ? shrunkReach(peerReach, chartPeers!.peerCount)
      : own
        ? shrunkReach(own.filter(accuracy => accuracy >= targetAccuracy).length / own.length, own.length)
        : NO_EVIDENCE_REACH;
    recommendations.push({
      song,
      targetAccuracy,
      neededAccuracy,
      targetRating,
      replacedRating: floor,
      ratingGain,
      category,
      peerCount: chartPeers?.peerCount ?? null,
      peerMedianAccuracy,
      peerReach,
      stretch: expectedAccuracy != null && expectedAccuracy < targetAccuracy,
      score: ratingGain * reach,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score || b.ratingGain - a.ratingGain);
}
