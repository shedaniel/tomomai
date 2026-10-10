import { describe, expect, it } from "vitest";
import type { RecentPlayDetails } from "@/lib/games/recent-details";
import { recentPlay } from ".";

const judgments = (cPerfect: number) => ({ cPerfect, perfect: 1, great: 2, good: 3, miss: 4 });

const recentDetails: RecentPlayDetails[] = [
  {
    game: "maimai",
    maxDxScore: 2100,
    playlog: {
      venue: "Arcade", combo: 500, maxCombo: 500, syncScore: null, maxSyncScore: null, rating: 15000, ratingChange: -12, fast: 3, late: 4,
      notes: { tap: judgments(300), hold: judgments(100), slide: judgments(60), touch: judgments(20), break: judgments(20) },
    },
  },
  {
    game: "chunithm",
    playlog: {
      maxCombo: 1425,
      judgments: { justiceCritical: 1400, justice: 20, attack: 5, miss: 0 },
      notePercentages: { tap: 101, hold: 101, slide: 100.5, air: 101, flick: 100 },
    },
  },
];

describe("game details", () => {
  it.each(recentDetails)("publishes $game recent play details as the query decodes them", details => {
    expect(recentPlay.shape.details.parse(details)).toStrictEqual(details);
    expect(recentPlay.shape.details.parse({ ...details, playlog: null })).toStrictEqual({ ...details, playlog: null });
  });
});
