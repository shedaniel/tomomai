import { describe, expect, it } from "vitest";
import { getGame } from "./registry";
import { playerRatingGain, ratingBucketFloor, type RatingStanding } from "./rating-standing";

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
