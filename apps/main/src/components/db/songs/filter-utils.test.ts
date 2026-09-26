import { describe, expect, it } from "vitest";
import { applyUniqueSongFilters, createUniqueSongFilterCategories } from "./filter-utils";
import type { UniqueSong } from "./types";

const chart: UniqueSong = {
  parentIds: [], index: 0, songName: "CHUNITHM chart", artist: "Artist", cover: "", type: "standard", genre: "ORIGINAL",
  addedVersion: 4, slug: "chart", aliases: [],
  difficulties: [{ difficulty: "master", level: "14+", levelPrecise: 145, levelPreciseEstimated: true, noteDesigner: null }],
};

describe("catalog metadata filters", () => {
  it("uses the actual display level instead of maimai's plus threshold", () => {
    const flattened = [{ ...chart, difficulties: chart.difficulties.map(difficulty => ({ ...difficulty, noteDesignerNumber: 0 })) }];
    expect(applyUniqueSongFilters([chart], flattened, [{ type: "level", value: "14+" }])).toHaveLength(1);
    expect(applyUniqueSongFilters([chart], flattened, [{ type: "level", value: "14" }])).toHaveLength(0);
  });

  it("offers and sorts the completed numeric versions", () => {
    const known = { ...chart, songName: "Known", addedVersion: 8, index: 1 };
    const categories = createUniqueSongFilterCategories("chunithm", [chart, known]);
    expect(categories.find(category => category.type === "addedVersion")?.options.map(option => option.value)).toEqual(["8", "4"]);
    expect(applyUniqueSongFilters([chart, known], [], [{ type: "sort", value: "version_asc" }]).map(song => song.songName)).toEqual(["CHUNITHM chart", "Known"]);
    expect(applyUniqueSongFilters([chart, known], [], [{ type: "sort", value: "version_desc" }]).map(song => song.songName)).toEqual(["Known", "CHUNITHM chart"]);
  });
});
