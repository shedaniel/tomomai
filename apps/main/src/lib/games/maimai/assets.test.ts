import { describe, expect, it } from "vitest";
import { getRatingImageUrl } from "./assets";

describe("maimai rating plate", () => {
  it("uses the kiwami plate only from CiRCLE onwards", () => {
    expect(getRatingImageUrl(16000, 13)).toBe("/res/rating/kiwami.png");
    expect(getRatingImageUrl(16000, 12)).toBe("/res/rating/rainbow.png");
  });

  it("maps rating thresholds to plates", () => {
    expect(getRatingImageUrl(0, 13)).toBe("/res/rating/normal.png");
    expect(getRatingImageUrl(1, 13)).toBe("/res/rating/blue.png");
    expect(getRatingImageUrl(14999, 13)).toBe("/res/rating/platinum.png");
  });
});
