import { describe, expect, it } from "vitest";
import { applyUniqueSongFilters, catalogDisplayLevel, createUniqueSongFilterCategories } from "./filter-utils";
import type { UniqueSong } from "./types";

const chart: UniqueSong = {
  parentIds: [], index: 0, songName: "CHUNITHM chart", artist: "Artist", cover: "", type: "standard", genre: "ORIGINAL",
  addedVersion: null, slug: "chart", aliases: [],
  difficulties: [{ difficulty: "master", level: "14+", levelPrecise: 145, levelPreciseEstimated: true, noteDesigner: null }],
};

describe("catalog metadata filters", () => {
  it("uses the actual display level instead of maimai's plus threshold", () => {
    expect(catalogDisplayLevel(chart.difficulties[0])).toBe("14+");
    const flattened = [{ ...chart, difficulties: chart.difficulties.map(difficulty => ({ ...difficulty, noteDesignerNumber: 0 })) }];
    expect(applyUniqueSongFilters([chart], flattened, [{ type: "level", value: "14+" }])).toHaveLength(1);
    expect(applyUniqueSongFilters([chart], flattened, [{ type: "level", value: "14" }])).toHaveLength(0);
  });

  it("does not create a fake added version and keeps unknown versions after known versions", () => {
    const known = { ...chart, songName: "Known", addedVersion: 8, index: 1 };
    const categories = createUniqueSongFilterCategories("chunithm", [chart, known]);
    expect(categories.find(category => category.type === "addedVersion")?.options.map(option => option.value)).toEqual(["8"]);
    expect(applyUniqueSongFilters([chart, known], [], [{ type: "sort", value: "version_asc" }]).map(song => song.songName)).toEqual(["Known", "CHUNITHM chart"]);
    expect(applyUniqueSongFilters([chart, known], [], [{ type: "sort", value: "version_desc" }]).map(song => song.songName)).toEqual(["Known", "CHUNITHM chart"]);
  });
});
