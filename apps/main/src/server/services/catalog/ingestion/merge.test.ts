import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { mergeCharts } from "./merge";
import { important, value, type SourceChart } from "./types";

const STD = 0, DX = 1;
const BASIC = 0, ADVANCED = 1, EXPERT = 2, MASTER = 3;

function chart(songName: string, fields: Partial<SourceChart> = {}): SourceChart {
  return { game: "maimai", songName, chartType: STD, difficulty: MASTER, ...fields };
}

/** A chart with every field a source usually sets. */
function song(songName: string, artist: string | undefined, fields: Partial<SourceChart> = {}): SourceChart {
  return chart(songName, { artist, level: "13", cover: "cover.jpg", genre: "POPS & ANIME", addedVersion: 0, levelPrecise: 130, ...fields });
}

let log: Logger;
beforeEach(() => {
  log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
});

const artists = (charts: SourceChart[]) => charts.map(c => value(c.artist));

describe("matching", () => {
  it("merges duplicate collected charts with their exact artist matches", () => {
    const result = mergeCharts(
      [song("Song A", "Artist A"), song("Song A", "Artist B")],
      [song("Song A", "Artist A"), song("Song A", "Artist B")],
      "default", log,
    );
    expect(artists(result)).toEqual(["Artist A", "Artist B"]);
  });

  it("merges a fetched chart into the collected chart with the closest artist", () => {
    const result = mergeCharts([song("Song A", "AB"), song("Song A", "CD")], [song("Song A", "ABC")], "only-modify", log);
    expect(artists(result).sort()).toEqual(["ABC", "CD"]);
  });

  it("merges regardless of artist distance when there is a single candidate", () => {
    expect(mergeCharts([song("Song A", "AB")], [song("Song A", "ABC")], "default", log)).toHaveLength(1);
    expect(mergeCharts([song("Song A", "Artist A")], [song("Song A", "Artist A")], "default", log)).toHaveLength(1);
    expect(mergeCharts([song("Song A", "Artist A")], [song("Song A", "Completely Different Artist")], "default", log)).toHaveLength(1);
  });

  it("merges into the first of equally distant candidates", () => {
    const result = mergeCharts([song("Song A", "AB"), song("Song A", "AD")], [song("Song A", "AC")], "default", log);
    expect(artists(result).sort()).toEqual(["AC", "AD"]);
  });

  it("keeps two same-named charts apart by artist (Link)", () => {
    const clean = "Clean Tears feat. Youna";
    const friends = "Circle of friends （天月-あまつき-・un:c・伊東歌詞太郎・コニー・はしやん）";
    const result = mergeCharts(
      [song("Link", clean, { chartType: DX, difficulty: BASIC, genre: "A" }), song("Link", friends, { chartType: DX, difficulty: BASIC, genre: important("B") })],
      [song("Link", clean, { chartType: DX, difficulty: BASIC, genre: "A" }), song("Link", friends, { chartType: DX, difficulty: BASIC, genre: "C" })],
      "default", log,
    );
    expect(result.map(c => [value(c.artist), value(c.genre)])).toEqual([[clean, "A"], [friends, "B"]]);
  });

  it("never merges across chart types or difficulties", () => {
    const types = mergeCharts([song("Song A", "Artist A"), song("Song A", "Artist A", { chartType: DX })], [song("Song A", "Artist A")], "default", log);
    expect(types.map(c => c.chartType).sort()).toEqual([STD, DX]);
    const difficulties = mergeCharts([song("Song A", "Artist A", { difficulty: BASIC }), song("Song A", "Artist A", { difficulty: EXPERT })], [song("Song A", "Artist A", { difficulty: BASIC })], "default", log);
    expect(difficulties.map(c => c.difficulty).sort()).toEqual([BASIC, EXPERT]);
    const sheets = mergeCharts(
      [BASIC, ADVANCED, MASTER].map(difficulty => chart("Multi Diff", { chartType: DX, difficulty, level: important("7"), addedVersion: important(5) })),
      [BASIC, ADVANCED, MASTER].map(difficulty => chart("Multi Diff", { chartType: DX, difficulty, level: important("7"), artist: important("Artist") })),
      "only-modify", log,
    );
    expect(artists(sheets)).toEqual(["Artist", "Artist", "Artist"]);
    const both = mergeCharts(
      [chart("Dual Version", { chartType: STD, level: important("13"), addedVersion: important(0) }), chart("Dual Version", { chartType: DX, level: important("14"), addedVersion: important(5) })],
      [chart("Dual Version", { chartType: STD, artist: important("Classic Artist"), genre: important("POPS & ANIME") }), chart("Dual Version", { chartType: DX, artist: important("Remix Artist"), genre: important("niconico") })],
      "only-modify", log,
    );
    expect(both.map(c => [c.chartType, value(c.artist), value(c.genre), value(c.addedVersion)])).toEqual([
      [STD, "Classic Artist", "POPS & ANIME", 0],
      [DX, "Remix Artist", "niconico", 5],
    ]);
  });

  it("keeps fetched charts with different versions apart", () => {
    const result = mergeCharts([], [song("A", "A", { chartType: DX, difficulty: BASIC, addedVersion: 0 }), song("A", "B", { chartType: DX, difficulty: BASIC, addedVersion: 1 })], "default", log);
    expect(result.map(c => [value(c.artist), value(c.addedVersion)])).toEqual([["A", 0], ["B", 1]]);
    const unversioned = mergeCharts([], [song("Song A", "Artist A", { addedVersion: undefined }), song("Song A", "Artist B", { addedVersion: undefined })], "default", log);
    expect(artists(unversioned)).toEqual(["Artist A", "Artist B"]);
  });

  it("fills missing artists by version, treating a missing version as a wildcard", () => {
    const result = mergeCharts(
      [song("A", undefined, { addedVersion: 0, genre: "A" }), song("A", undefined, { addedVersion: 1, genre: "A" }), song("C", undefined, { addedVersion: 2, genre: "A" })],
      [song("A", "A", { addedVersion: 0, genre: "B" }), song("A", "B", { addedVersion: 1, genre: "B" }), song("C", "C", { addedVersion: undefined, genre: "B" })],
      "default", log,
    );
    expect(result.map(c => [value(c.artist), value(c.addedVersion), value(c.genre)])).toEqual([["A", 0, "B"], ["B", 1, "B"], ["C", 2, "B"]]);
  });

  it("merges a single cross-source candidate despite a version mismatch", () => {
    const modify = mergeCharts(
      [chart("Version Test", { level: important("14"), addedVersion: important(5), artist: "Old Artist" })],
      [chart("Version Test", { level: important("14"), addedVersion: 6, artist: important("New Artist"), genre: important("VARIETY") })],
      "only-modify", log,
    );
    expect(modify.map(c => [value(c.addedVersion), value(c.artist), value(c.genre)])).toEqual([[5, "New Artist", "VARIETY"]]);
    const merged = mergeCharts(
      [chart("Default Mode Test", { level: important("14"), addedVersion: important(5), artist: "Some Artist" })],
      [chart("Default Mode Test", { level: important("14+"), addedVersion: 8, artist: "Some Artist", genre: important("VARIETY") })],
      "default", log,
    );
    expect(merged.map(c => [value(c.addedVersion), value(c.level), value(c.genre)])).toEqual([[5, "14+", "VARIETY"]]);
  });

  it("pairs several cross-source candidates by closest artist when no version matches", () => {
    const result = mergeCharts(
      [
        chart("Version Test", { level: "14", addedVersion: important(5), artist: "Artist A", genre: "Genre A" }),
        chart("Version Test", { level: "13", addedVersion: important(4), artist: "Artist B", genre: "Genre B" }),
      ],
      [
        chart("Version Test", { level: important("14+"), addedVersion: 7, artist: "Artist A", genre: "Genre A" }),
        chart("Version Test", { level: important("13+"), addedVersion: 6, artist: "Artist B", genre: "Genre B" }),
      ],
      "only-modify", log,
    );
    expect(result.map(c => [c.artist, value(c.addedVersion), value(c.level), value(c.genre)])).toEqual([
      ["Artist A", 5, "14+", "Genre A"],
      ["Artist B", 4, "13+", "Genre B"],
    ]);
  });

  it("prefers a matching version over a closer artist", () => {
    const result = mergeCharts(
      [
        chart("Priority Test", { level: "13", addedVersion: important(5), artist: "Distant Artist Name", genre: "Genre X" }),
        chart("Priority Test", { level: "12", addedVersion: important(3), artist: "Exact Match", genre: "Genre Y" }),
      ],
      [chart("Priority Test", { level: important("13+"), addedVersion: 5, artist: "Exact Match", genre: important("Genre Z") })],
      "only-modify", log,
    );
    expect(result.map(c => [value(c.addedVersion), value(c.level), value(c.genre)])).toEqual([[3, "12", "Genre Y"], [5, "13+", "Genre Z"]]);
  });

  it("does not merge fetched charts into a collected chart with another key", () => {
    const result = mergeCharts(
      [chart("Unrelated Song", { level: "12", addedVersion: important(1), artist: "Other Artist" })],
      [chart("Same Key Song", { level: "13", addedVersion: 2, artist: "Artist A" }), chart("Same Key Song", { level: "14", addedVersion: 3, artist: "Artist B" })],
      "default", log,
    );
    expect(result.map(c => c.songName)).toEqual(["Unrelated Song", "Same Key Song", "Same Key Song"]);
  });
});

describe("modes", () => {
  it("default adds unmatched charts from either side", () => {
    expect(mergeCharts([], [song("Song A", "Artist A"), song("Song B", "Artist B")], "default", log).map(c => c.songName)).toEqual(["Song A", "Song B"]);
    expect(mergeCharts([song("Song A", "Artist A"), song("Song B", "Artist B")], [], "default", log).map(c => c.songName)).toEqual(["Song A", "Song B"]);
  });

  it("default fills a collected chart from its match", () => {
    const result = mergeCharts([song("C", undefined, { addedVersion: 2, genre: "A" })], [song("C", "C", { addedVersion: undefined, genre: "B" })], "default", log);
    expect(result.map(c => [value(c.artist), value(c.addedVersion), value(c.genre)])).toEqual([["C", 2, "B"]]);
  });

  it("only-modify merges matches and never adds a fetched chart", () => {
    const result = mergeCharts([song("Song A", "Artist A"), song("Song B", "Artist B")], [song("Song A", "Artist A"), song("Song C", "Artist C")], "only-modify", log);
    expect(result.map(c => c.songName).sort()).toEqual(["Song A", "Song B"]);
    const kept = mergeCharts([song("Song A", "Artist A"), song("Song A", "Artist B")], [song("Song A", "Artist A")], "only-modify", log);
    expect(artists(kept)).toEqual(["Artist B", "Artist A"]);
    const filled = mergeCharts([song("C", undefined, { addedVersion: 2, genre: "A" })], [song("C", "C", { addedVersion: undefined, genre: "B" })], "only-modify", log);
    expect(filled.map(c => [value(c.artist), value(c.addedVersion), value(c.genre)])).toEqual([["C", 2, "B"]]);
  });

  it("only-fallback adds a fetched chart only when nothing matches, and never merges", () => {
    const result = mergeCharts(
      [song("Song A", "Artist A"), song("Song B", "Artist B")],
      [song("Song A", "Similar Artist"), song("Song C", "Artist C")],
      "only-fallback", log,
    );
    expect(result.map(c => [c.songName, value(c.artist)])).toEqual([["Song A", "Artist A"], ["Song B", "Artist B"], ["Song C", "Artist C"]]);
  });

  it("lets a chart override its source's mode", () => {
    const result = mergeCharts([song("Existing", "Artist")], [
      { ...song("Existing", "Updated Artist"), mode: "only-modify" },
      { ...song("Unmatched", "Artist"), mode: "only-modify" },
    ], "default", log);
    expect(result.map(c => [c.songName, value(c.artist)])).toEqual([["Existing", "Updated Artist"]]);
  });
});

describe("field merging", () => {
  it("keeps an important value over a plain one and fills values the collected chart lacks", () => {
    const [kept] = mergeCharts([song("Song A", undefined, { artist: important("Important Artist") })], [song("Song A", "Different Artist")], "default", log);
    expect(kept.artist).toEqual(important("Important Artist"));
    const scraped = [
      chart("TEST", { chartType: DX, level: important("14"), addedVersion: important(5), extras: { inputName: "music_12345", inputValue: "67890" } }),
      chart("Another Song", { difficulty: EXPERT, level: important("13"), addedVersion: important(3), extras: { inputName: "music_11111", inputValue: "22222" } }),
    ];
    const official = [chart("TEST", { chartType: DX, level: important("14"), cover: "https://example.com/cover.jpg", genre: important("POPS & ANIME"), artist: important("Test Artist") })];
    const result = mergeCharts(scraped, official, "only-modify", log);
    const test = result.find(c => c.songName === "TEST")!;
    const another = result.find(c => c.songName === "Another Song")!;
    expect([value(test.level), value(test.addedVersion), value(test.cover), value(test.genre), value(test.artist)])
      .toEqual(["14", 5, "https://example.com/cover.jpg", "POPS & ANIME", "Test Artist"]);
    expect(test.extras).toEqual({ inputName: "music_12345", inputValue: "67890" });
    expect([value(another.level), value(another.addedVersion), another.cover, another.genre, another.artist]).toEqual(["13", 3, undefined, undefined, undefined]);
  });

  it("keeps a collected value the fetched chart does not have", () => {
    const [merged] = mergeCharts([chart("Test", { level: important("13"), addedVersion: important(5), artist: "Artist" })], [chart("Test", { level: important("13") })], "only-modify", log);
    expect(value(merged.artist)).toBe("Artist");
  });

  it("takes the fetched value when both are important, and warns that they conflict", () => {
    const [merged] = mergeCharts(
      [chart("Conflict Song", { chartType: DX, level: important("14"), addedVersion: important(5) })],
      [chart("Conflict Song", { chartType: DX, level: important("14+"), artist: important("Artist") })],
      "only-modify", log,
    );
    expect([value(merged.level), value(merged.artist)]).toEqual(["14+", "Artist"]);
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ from: "\"14\"", to: "\"14+\"" }), "Data mismatch: important field 'level' has conflicting values");
  });

  it("combines the extras of both charts", () => {
    const [merged] = mergeCharts([song("Song A", "Artist A", { extras: { key1: "value1" } })], [song("Song A", "Artist A", { extras: { key2: "value2" } })], "default", log);
    expect(merged.extras).toEqual({ key1: "value1", key2: "value2" });
    const [scraped] = mergeCharts(
      [chart("Extras Test", { chartType: DX, level: important("13"), addedVersion: important(5), extras: { inputName: "music_test", inputValue: "12345", customField: "custom" } })],
      [chart("Extras Test", { chartType: DX, level: important("13"), artist: important("Artist"), extras: { officialField: "official" } })],
      "only-modify", log,
    );
    expect(scraped.extras).toEqual({ inputName: "music_test", inputValue: "12345", customField: "custom", officialField: "official" });
  });
});

describe("ordering", () => {
  it("lets a version-matching fetched chart claim its collected chart before a non-matching one (Link)", () => {
    const collected = chart("Link", { difficulty: ADVANCED, level: important("7+"), addedVersion: important(-12), artist: "Clean Tears feat. Youna", bpm: important(132), extras: { dbId: "51830", source: "database" } });
    const result = mergeCharts([collected], [
      chart("Link", { difficulty: ADVANCED, level: important("8"), addedVersion: important(-9), artist: "Circle of friends", bpm: important(198), extras: { source: "upload" } }),
      chart("Link", { difficulty: ADVANCED, level: important("7+"), addedVersion: important(-12), artist: "Clean Tears feat. Youna", bpm: important(132), extras: { source: "upload" } }),
    ], "default", log);
    const byVersion = new Map(result.map(c => [value(c.addedVersion), c]));
    expect(result).toHaveLength(2);
    expect(byVersion.get(-12)).toMatchObject({ artist: "Clean Tears feat. Youna", extras: { dbId: "51830" } });
    expect(byVersion.get(-9)?.artist).toBe("Circle of friends");
    expect(byVersion.get(-9)?.extras?.dbId).toBeUndefined();
  });
});
