import { getRatingFactor, SongWithRating, splitSongs } from "@/lib/rating-calculator";

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

export function generateRecommendations(songsWithRating: SongWithRating[], version: number): RecommendationData[] {
  const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsWithRating, version);

  const minNewRating = newSongsB15.length > 0 ? Math.min(...newSongsB15.map(s => s.rating)) : 0;
  const minOldRating = oldSongsB35.length > 0 ? Math.min(...oldSongsB35.map(s => s.rating)) : 0;

  const recommendations: RecommendationData[] = [];

  const newSongsB15Tuple = newSongsB15.map(song => ({ song, isNew: true }));
  const oldSongsB35Tuple = oldSongsB35.map(song => ({ song, isNew: false }));
  const newSongsRemainingTuple = newSongsRemaining.map(song => ({ song, isNew: true }));
  const oldSongsRemainingTuple = oldSongsRemaining.map(song => ({ song, isNew: false }));

  [...newSongsB15Tuple, ...oldSongsB35Tuple, ...newSongsRemainingTuple, ...oldSongsRemainingTuple].forEach(({ song, isNew }) => {
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
        order,
      });

      order++;
    }
  });

  return recommendations.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    if (Math.abs(a.efficiency - b.efficiency) < 0.1) {
      return b.ratingGain - a.ratingGain;
    }
    return b.efficiency - a.efficiency;
  });
}
