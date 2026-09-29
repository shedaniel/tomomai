import { Target } from "lucide-react";
import { expect, it } from "vitest";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { generateRecommendations } from "@/lib/games/recommendations";
import { applyRecommendationFilters, createRecommendationFilterCategories, createRecommendationFilterLabel } from "./recommendation-filters";

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
  expect(createRecommendationFilterLabel({ type: "target", value: "1600 - 1649" }, { new: "New", old: "Old" }, "chunithm")).toBe("16.00 - 16.49");
});

it("buckets CHUNITHM target ratings by half a rating point", () => {
  const labels = { difficulty: "", level: "", type: "", targetRating: "", achievement: "", version: "", new: "", old: "" };
  const icons = { difficulty: Target, level: Target, type: Target, target: Target, achievement: Target, version: Target };
  const categories = createRecommendationFilterCategories(generateRecommendations(data), labels, icons, "chunithm");
  expect(categories.find(category => category.type === "target")?.options.map(option => option.label)).toContain("16.00 - 16.49");
  expect(categories.find(category => category.type === "difficulty")?.options).toEqual([{ value: "ultima", label: "ULTIMA" }]);
});
