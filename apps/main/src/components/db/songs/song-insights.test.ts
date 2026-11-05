import { describe, expect, it } from "vitest";
import { scoreMonthAgo } from "./song-insights";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 2);
const point = (daysAgo: number, scoreValue: number) => ({ fetchedAt: new Date(NOW - daysAgo * DAY), scoreValue, comboStatus: 0, syncStatus: 0, clearStatus: 0 });

describe("scoreMonthAgo", () => {
  it("takes the last score from before the month", () => {
    expect(scoreMonthAgo([point(60, 900_000), point(40, 950_000), point(10, 990_000)], NOW)?.scoreValue).toBe(950_000);
  });

  it("is null without history from before the month or without a change since", () => {
    expect(scoreMonthAgo([point(20, 900_000), point(5, 990_000)], NOW)).toBeNull();
    expect(scoreMonthAgo([point(45, 990_000), point(5, 990_000)], NOW)).toBeNull();
    expect(scoreMonthAgo(undefined, NOW)).toBeNull();
  });
});
