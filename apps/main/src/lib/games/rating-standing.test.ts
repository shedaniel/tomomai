import { describe, expect, it } from "vitest";
import { getGame } from "./registry";
import { nextRatingTarget, playerRatingGain, ratingBucketFloor, type RatingStanding } from "./rating-standing";

const { bucketSizes } = getGame("maimai").rating;

function standing(overrides: Partial<RatingStanding> = {}): RatingStanding {
  return { gameVersion: 0, playerRating: 0, new: [300, 290], old: Array.from({ length: bucketSizes.old }, () => 250), charts: {}, ...overrides };
}

describe("playerRatingGain", () => {
  it("adds a new chart in full to a bucket with room", () => {
    expect(ratingBucketFloor("maimai", standing(), "new")).toBeNull();
    expect(playerRatingGain("maimai", standing(), { bucket: "new", index: null }, 280.9)).toBe(280);
  });

  it("replaces the lowest chart of a full bucket", () => {
    expect(ratingBucketFloor("maimai", standing(), "old")).toBe(250);
    expect(playerRatingGain("maimai", standing(), { bucket: "old", index: null }, 260)).toBe(10);
    expect(playerRatingGain("maimai", standing(), { bucket: "old", index: null }, 250)).toBe(0);
  });

  it("raises a chart already in the selection in place", () => {
    expect(playerRatingGain("maimai", standing(), { bucket: "new", index: 0 }, 310)).toBe(10);
    expect(playerRatingGain("maimai", standing(), { bucket: "new", index: 0 }, 295)).toBe(0);
  });
});

describe("nextRatingTarget", () => {
  it("names the nearest target that raises the player rating", () => {
    const full = standing({ old: Array.from({ length: bucketSizes.old }, () => 200) });
    const next = nextRatingTarget("maimai", full, { bucket: "old", index: null, levelPrecise: 130, difficultyCode: 3 }, { scoreValue: 970_000, comboStatus: 0 });
    expect(next).not.toBeNull();
    expect(next!.target.scoreValue).toBeGreaterThan(970_000);
    expect(next!.gain).toBeGreaterThan(0);
  });

  it("finds nothing for a chart rated below the bucket's floor at every target", () => {
    const strong = standing({ old: Array.from({ length: bucketSizes.old }, () => 400) });
    expect(nextRatingTarget("maimai", strong, { bucket: "old", index: null, levelPrecise: 50, difficultyCode: 0 }, { scoreValue: 900_000, comboStatus: 0 })).toBeNull();
  });
});
