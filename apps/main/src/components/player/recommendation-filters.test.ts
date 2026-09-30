import { Target } from "lucide-react";
import { expect, it } from "vitest";
import { codeOf } from "@/lib/games/codes";
import type { GamePlayerScore } from "@/lib/games/player-view";
import { generateRecommendations } from "@/lib/games/recommendations";
import type { CanonicalGameId } from "@/lib/games/types";
import { applyRecommendationFilters, createRecommendationFilterCategories, createRecommendationFilterLabel } from "./recommendation-filters";

const translations = { difficulty: "", level: "", type: "", targetRating: "", achievement: "", version: "", new: "New", old: "Old" };
const icons = { difficulty: Target, level: Target, type: Target, target: Target, achievement: Target, version: Target };
const chart: GamePlayerScore = {
  songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
  addedVersion: 9, difficultyCode: 3, typeCode: 0, scoreValue: 1000000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0,
};

function recommend(game: CanonicalGameId, gameVersion: number, songs: GamePlayerScore[]) {
  return generateRecommendations({
    snapshot: { publicId: "snapshot", game, gameVersion, displayName: "Player", rating: 0, fetchedAt: new Date() },
    songs,
  });
}
function optionLabels(game: CanonicalGameId, recommendations: ReturnType<typeof recommend>) {
  return Object.fromEntries(createRecommendationFilterCategories(recommendations, translations, icons, game)
    .map(category => [category.type, category.options.map(option => option.label)]));
}

it("filters CHUNITHM recommendations by difficulty, score target and catalog level, and hides single-option categories", () => {
  const ultima = codeOf("chunithm", "difficulty", "ultima");
  const recommendations = recommend("chunithm", 9, [
    { ...chart, songId: "ultima", difficultyCode: ultima, level: "14+" },
    { ...chart, songId: "master", levelPrecise: 130, level: "13" },
  ]);
  expect(optionLabels("chunithm", recommendations)).toEqual({
    difficulty: ["MASTER", "ULTIMA"],
    level: ["Lv 13", "Lv 14+"],
    target: ["14.50 - 14.99", "15.00 - 15.49", "15.50 - 15.99", "16.00 - 16.49"],
    achievement: ["SS+", "SSS", "SSS+"],
  });
  const filtered = applyRecommendationFilters(recommendations, [
    { type: "difficulty", value: String(ultima) }, { type: "achievement", value: "SSS" }, { type: "level", value: "14+" },
  ]);
  expect(filtered.map(rec => [rec.song.songId, rec.targetRating])).toEqual([["ultima", 1600]]);
  expect(createRecommendationFilterLabel({ type: "target", value: "1600 - 1649" }, translations, "chunithm")).toBe("16.00 - 16.49");
});

it("lists maimai difficulties, chart types and targets in game order and filters the AP target by its label", () => {
  const code = (key: string) => codeOf("maimai", "difficulty", key);
  const dx = codeOf("maimai", "chartType", "dx");
  const recommendations = recommend("maimai", 13, [
    { ...chart, songId: "remaster", difficultyCode: code("remaster"), typeCode: dx, addedVersion: 13, scoreValue: 1005000 },
    { ...chart, songId: "expert", difficultyCode: code("expert"), addedVersion: 5, scoreValue: 990000 },
    { ...chart, songId: "basic", difficultyCode: code("basic"), typeCode: dx, addedVersion: 13, scoreValue: 970000 },
    { ...chart, songId: "master", difficultyCode: code("master"), addedVersion: 13, scoreValue: 980000 },
    { ...chart, songId: "advanced", difficultyCode: code("advanced"), addedVersion: 5, scoreValue: 990000 },
  ]);
  expect(optionLabels("maimai", recommendations)).toMatchObject({
    difficulty: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"],
    type: ["STD", "DX"],
    achievement: ["S+", "SS", "SS+", "SSS", "SSS+", "AP"],
    version: ["New", "Old"],
  });
  const ap = applyRecommendationFilters(recommendations, [{ type: "achievement", value: "AP" }]);
  expect(ap.map(rec => rec.song.songId).sort()).toEqual(["advanced", "basic", "expert", "master", "remaster"]);
  expect(ap.every(rec => rec.target.kind === "combo")).toBe(true);
});
