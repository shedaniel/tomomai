// @copied-from apps/main/src/lib/score-details.ts — temporary duplicate; do not edit manually, change apps/main and re-sync (extracted to a shared package in the catalogue PR).

import { logger } from "./logger";

// Constants for achievement calculation
const BASE_SCORE_PER_TYPE = {
  tap: 500,
  hold: 1000,
  slide: 1500,
  touch: 500,
  break: 2500,
} as const;

const JUDGMENT_MULTIPLIERS = {
  perfect: 1.0,
  great: 0.8,
  good: 0.5,
  miss: 0.0,
} as const;

const BREAK_JUDGMENT_MULTIPLIERS = {
  criticalPerfect: 1.0,
  perfect: 1.0,
  great2000: 0.8,
  great1500: 0.6,
  great1250: 0.5,
  good: 0.4,
  miss: 0.0,
} as const;

const BREAK_BONUS_POINTS = 100;
const MAX_BREAK_POINTS = 2600;

const BREAK_BONUS_MULTIPLIER: Record<string, number> = {
  criticalPerfect: 1.0,
  perfect2550: 0.75,
  perfect2500: 0.5,
  great2000: 0.4,
  great1500: 0.4,
  great1250: 0.4,
  good: 0.3,
  miss: 0.0,
};

const BREAK_SCORES = {
  cp: 2600,
  perfect2550: 2550,
  perfect2500: 2500,
  great2000: 2000,
  great1500: 1500,
  great1250: 1250,
  good: 1000,
  miss: 0,
} as const;

interface NoteCount {
  criticalPerfect: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

interface CalculateAchievementParams {
  tap: NoteCount;
  hold: NoteCount;
  slide: NoteCount;
  touch: NoteCount;
  break: NoteCount;
}

interface BreakDistribution {
  perfect2550: number;
  perfect2500: number;
  great2000: number;
  great1500: number;
  great1250: number;
}

/**
 * Calculate achievement percentage for a given note distribution
 */
function calculateAchievement(notes: CalculateAchievementParams, breakDist: BreakDistribution): number {
  // Calculate total base score
  const totalTap = notes.tap.criticalPerfect + notes.tap.perfect + notes.tap.great + notes.tap.good + notes.tap.miss;
  const totalHold = notes.hold.criticalPerfect + notes.hold.perfect + notes.hold.great + notes.hold.good + notes.hold.miss;
  const totalSlide = notes.slide.criticalPerfect + notes.slide.perfect + notes.slide.great + notes.slide.good + notes.slide.miss;
  const totalTouch = notes.touch.criticalPerfect + notes.touch.perfect + notes.touch.great + notes.touch.good + notes.touch.miss;
  const totalBreak = notes.break.criticalPerfect + notes.break.perfect + notes.break.great + notes.break.good + notes.break.miss;

  const totalBaseScore =
    totalTap * BASE_SCORE_PER_TYPE.tap +
    totalHold * BASE_SCORE_PER_TYPE.hold +
    totalSlide * BASE_SCORE_PER_TYPE.slide +
    totalTouch * BASE_SCORE_PER_TYPE.touch +
    totalBreak * BASE_SCORE_PER_TYPE.break;

  if (totalBaseScore === 0) return 0;

  // Check break distribution validity
  if (breakDist.perfect2550 + breakDist.perfect2500 !== notes.break.perfect) {
    logger.error(`Break distribution invalid: perfect2550 + perfect2500 !== perfect: ${breakDist.perfect2550} + ${breakDist.perfect2500} !== ${notes.break.perfect}`);
    return 0;
  }
  if (breakDist.great2000 + breakDist.great1500 + breakDist.great1250 !== notes.break.great) {
    logger.error(`Break distribution invalid: great2000 + great1500 + great1250 !== great: ${breakDist.great2000} + ${breakDist.great1500} + ${breakDist.great1250} !== ${notes.break.great}`);
    return 0;
  }

  // Calculate actual score for regular notes
  let actualScore = 0;

  // Tap
  actualScore += notes.tap.criticalPerfect * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.tap.perfect * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.tap.great * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.tap.good * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.good;

  // Hold
  actualScore += notes.hold.criticalPerfect * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.hold.perfect * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.hold.great * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.hold.good * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.good;

  // Slide
  actualScore += notes.slide.criticalPerfect * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.slide.perfect * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.slide.great * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.slide.good * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.good;

  // Touch
  actualScore += notes.touch.criticalPerfect * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.touch.perfect * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.touch.great * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.touch.good * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.good;

  // Break
  actualScore += notes.break.criticalPerfect * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
  actualScore += notes.break.perfect * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.perfect;
  actualScore += breakDist.great2000 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great2000;
  actualScore += breakDist.great1500 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1500;
  actualScore += breakDist.great1250 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1250;
  actualScore += notes.break.good * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.good;
  actualScore += notes.break.miss * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.miss;

  // Break - additional bonus points
  let bonusPoints = 0, totalBonusPoints = 0;
  bonusPoints += notes.break.criticalPerfect * BREAK_BONUS_MULTIPLIER.criticalPerfect;
  bonusPoints += breakDist.perfect2550 * BREAK_BONUS_MULTIPLIER.perfect2550;
  bonusPoints += breakDist.perfect2500 * BREAK_BONUS_MULTIPLIER.perfect2500;
  bonusPoints += breakDist.great2000 * BREAK_BONUS_MULTIPLIER.great2000;
  bonusPoints += breakDist.great1500 * BREAK_BONUS_MULTIPLIER.great1500;
  bonusPoints += breakDist.great1250 * BREAK_BONUS_MULTIPLIER.great1250;
  bonusPoints += notes.break.good * BREAK_BONUS_MULTIPLIER.good;
  bonusPoints += notes.break.miss * BREAK_BONUS_MULTIPLIER.miss;

  totalBonusPoints += notes.break.criticalPerfect;
  totalBonusPoints += notes.break.perfect;
  totalBonusPoints += notes.break.great;
  totalBonusPoints += notes.break.good;
  totalBonusPoints += notes.break.miss;

  const scorePerPercentage = totalBaseScore / 100;
  const bonusPointsPercentage = bonusPoints / totalBonusPoints;
  return actualScore / scorePerPercentage + bonusPointsPercentage;
}

/**
 * Find the break distribution that best matches the actual achievement
 * Uses a "walk" algorithm to try different distributions
 */
export function distributeBreaks(
  notes: CalculateAchievementParams,
  actualAchievement: number,
  perfectCount: number,
  greatCount: number
): BreakDistribution {
  let bestDist: BreakDistribution = {
    perfect2550: perfectCount,
    perfect2500: 0,
    great2000: greatCount,
    great1500: 0,
    great1250: 0,
  };
  let bestDiff = Infinity;

  // Try all possible distributions of perfects (2550 vs 2500)
  for (let p2550 = 0; p2550 <= perfectCount; p2550++) {
    const p2500 = perfectCount - p2550;

    // Try all possible distributions of greats (2000, 1500, 1250)
    for (let g2000 = 0; g2000 <= greatCount; g2000++) {
      for (let g1500 = 0; g1500 <= greatCount - g2000; g1500++) {
        const g1250 = greatCount - g2000 - g1500;

        const dist: BreakDistribution = {
          perfect2550: p2550,
          perfect2500: p2500,
          great2000: g2000,
          great1500: g1500,
          great1250: g1250,
        };

        const calculatedAchievement = calculateAchievement(notes, dist);
        const diff = Math.abs(calculatedAchievement - actualAchievement);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestDist = dist;
        }

        // logger.debug(`Trying distribution ${p2550}-${p2500} ${g2000}-${g1500}-${g1250}, diff: ${diff}, calculatedAchievement: ${calculatedAchievement}, actualAchievement: ${actualAchievement}`);

        // Early exit if we found an exact match
        if (diff < 0.00001) {
          return bestDist;
        }
      }
    }
  }

  return bestDist;
}

/**
 * Calculate percentage LOSS for each note judgment cell compared to Critical Perfect
 */
export function calculateNoteLosses(notes: CalculateAchievementParams, breakDist: BreakDistribution) {
  // Calculate total base score (denominator) - similar to reference's totalBaseScore
  const totalTap = notes.tap.criticalPerfect + notes.tap.perfect + notes.tap.great + notes.tap.good + notes.tap.miss;
  const totalHold = notes.hold.criticalPerfect + notes.hold.perfect + notes.hold.great + notes.hold.good + notes.hold.miss;
  const totalSlide = notes.slide.criticalPerfect + notes.slide.perfect + notes.slide.great + notes.slide.good + notes.slide.miss;
  const totalTouch = notes.touch.criticalPerfect + notes.touch.perfect + notes.touch.great + notes.touch.good + notes.touch.miss;
  const totalBreak = notes.break.criticalPerfect + notes.break.perfect + notes.break.great + notes.break.good + notes.break.miss;

  const totalBaseScore =
    totalTap * BASE_SCORE_PER_TYPE.tap +
    totalHold * BASE_SCORE_PER_TYPE.hold +
    totalSlide * BASE_SCORE_PER_TYPE.slide +
    totalTouch * BASE_SCORE_PER_TYPE.touch +
    totalBreak * BASE_SCORE_PER_TYPE.break;

  const scorePerPercentage = totalBaseScore / 100;

  // Helper to calculate loss percentage for regular notes
  // Loss = what we would have gotten if CP - what we actually got
  const calcRegularLoss = (count: number, baseScore: number, multiplier: number) => {
    if (scorePerPercentage === 0 || count === 0) return 0;
    const cpScore = count * baseScore * JUDGMENT_MULTIPLIERS.perfect;
    const actualScore = count * baseScore * multiplier;
    const lossScore = cpScore - actualScore;
    return (lossScore / scorePerPercentage);
  };

  // Calculate break perfect loss using actual distribution
  // Following the same logic as calculateAchievement: base score + bonus
  const calcBreakPerfectLoss = () => {
    if (scorePerPercentage === 0 || totalBreak === 0) return 0;

    const perfectCount = notes.break.perfect;
    if (perfectCount === 0) return 0;

    // What we would get if all perfects were CP
    const cpBaseScore = perfectCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = perfectCount * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get with the distribution (base score)
    const actualBaseScore = perfectCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.perfect;

    // What we actually get with the distribution (bonus points)
    const actualBonusPoints =
      breakDist.perfect2550 * BREAK_BONUS_MULTIPLIER.perfect2550 +
      breakDist.perfect2500 * BREAK_BONUS_MULTIPLIER.perfect2500;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  // Calculate break great loss using actual distribution
  const calcBreakGreatLoss = () => {
    if (scorePerPercentage === 0 || totalBreak === 0) return 0;

    const greatCount = notes.break.great;
    if (greatCount === 0) return 0;

    // What we would get if all greats were CP
    const cpBaseScore = greatCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = greatCount * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get with the distribution (base score)
    const actualBaseScore =
      breakDist.great2000 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great2000 +
      breakDist.great1500 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1500 +
      breakDist.great1250 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1250;

    // What we actually get with the distribution (bonus points)
    const actualBonusPoints =
      breakDist.great2000 * BREAK_BONUS_MULTIPLIER.great2000 +
      breakDist.great1500 * BREAK_BONUS_MULTIPLIER.great1500 +
      breakDist.great1250 * BREAK_BONUS_MULTIPLIER.great1250;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  // Helper to calculate loss percentage for break good/miss
  const calcBreakLoss = (count: number, judgmentMultiplier: number, bonusMultiplier: number) => {
    if (scorePerPercentage === 0 || totalBreak === 0 || count === 0) return 0;

    // What we would get if CP
    const cpBaseScore = count * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = count * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get
    const actualBaseScore = count * BASE_SCORE_PER_TYPE.break * judgmentMultiplier;
    const actualBonusPoints = count * bonusMultiplier;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  return {
    tap: {
      great: calcRegularLoss(notes.tap.great, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.tap.good, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.tap.miss, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.miss),
    },
    hold: {
      great: calcRegularLoss(notes.hold.great, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.hold.good, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.hold.miss, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.miss),
    },
    slide: {
      great: calcRegularLoss(notes.slide.great, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.slide.good, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.slide.miss, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.miss),
    },
    touch: {
      great: calcRegularLoss(notes.touch.great, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.touch.good, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.touch.miss, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.miss),
    },
    break: {
      perfect: calcBreakPerfectLoss(),
      great: calcBreakGreatLoss(),
      good: calcBreakLoss(notes.break.good, BREAK_JUDGMENT_MULTIPLIERS.good, BREAK_BONUS_MULTIPLIER.good),
      miss: calcBreakLoss(notes.break.miss, BREAK_JUDGMENT_MULTIPLIERS.miss, BREAK_BONUS_MULTIPLIER.miss),
    },
  };
}

export function calculateDXStars(dxScore: number, maxDxScore: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const percentage = dxScore / maxDxScore;
  if (dxScore >= maxDxScore) return 7;
  if (percentage >= 0.99) return 6;
  if (percentage >= 0.97) return 5;
  if (percentage >= 0.95) return 4;
  if (percentage >= 0.93) return 3;
  if (percentage >= 0.90) return 2;
  if (percentage >= 0.85) return 1;
  return 0;
}
