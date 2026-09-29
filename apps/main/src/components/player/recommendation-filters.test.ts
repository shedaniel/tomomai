import { expect, it } from "vitest";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { generateRecommendations } from "@/lib/games/recommendations";
import { applyRecommendationFilters, createRecommendationFilterLabel } from "./recommendation-filters";

const data: GameSnapshotData = {
  snapshot: { publicId: "snapshot", game: "chunithm", gameVersion: 9, displayName: "Player", rating: 30, fetchedAt: new Date() },
  songs: [{ songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14+", levelPrecise: 140,
    addedVersion: 9, difficultyCode: 4, typeCode: 0, scoreValue: 1000000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 }],
};

it("filters CHUNITHM recommendations by their real score target and catalog display level", () => {
  const recommendations = generateRecommendations(data);
  const filtered = applyRecommendationFilters(recommendations, [{ type: "difficulty", value: "ultima" }, { type: "achievement", value: "1007500" }, { type: "level", value: "14+" }]);
  expect(filtered).toHaveLength(1);
  expect(filtered[0].targetRating).toBe(1600);
  expect(createRecommendationFilterLabel({ type: "achievement", value: "1007500" }, { new: "New", old: "Old" }, "chunithm")).toBe("SSS");
  expect(createRecommendationFilterLabel({ type: "target", value: "1600 - 1609" }, { new: "New", old: "Old" }, "chunithm")).toBe("16.00 - 16.09");
});
