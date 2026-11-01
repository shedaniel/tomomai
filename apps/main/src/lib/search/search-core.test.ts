import { describe, expect, it } from "vitest";
import { createSearchIndex, foldRomaji, normalizeSearchText, parseSearchQuery, searchIndex, searchItems, type SearchField } from "@tomomai/utils/search";

type Song = { title: string; artist: string; aliases?: string[]; levels?: string[] };

const fields: SearchField<Song>[] = [
  { get: song => song.title, weight: 3 },
  { get: song => song.artist, weight: 2 },
  { get: song => song.aliases, weight: 2 },
  { get: song => song.levels, literal: true },
];

const songs: Song[] = [
  { title: "群青シグナル", artist: "Uchiyama", aliases: ["gunjou shigunaru", "グンジョウシグナル", "ぐんじょうしぐなる"], levels: ["13+", "13.7"] },
  { title: "Fragrance", artist: "Tsukasa", levels: ["14", "14.2"] },
  { title: "PANDORA PARADOXXX", artist: "Sakuzyo", levels: ["15", "15.0"] },
  { title: "Pandemonium", artist: "Someone", levels: ["12+", "12.8"] },
  { title: "Café au Lait", artist: "Ｍｉｌｋ", levels: ["10"] },
];

const titles = (query: string) => searchItems(songs, fields, query).map(song => song.title);

describe("normalizeSearchText", () => {
  it("folds case, width, diacritics, separators and kana", () => {
    expect(normalizeSearchText("Café  au-Lait!")).toBe("cafeaulait");
    expect(normalizeSearchText("ＭＩＬＫ")).toBe("milk");
    expect(normalizeSearchText("ぐんじょう")).toBe(normalizeSearchText("グンジョウ"));
    expect(normalizeSearchText("ｸﾞﾝｼﾞｮｳ")).toBe(normalizeSearchText("グンジョウ"));
  });

  it("collapses romaji long vowels", () => {
    expect(foldRomaji(normalizeSearchText("gunjou"))).toBe(foldRomaji(normalizeSearchText("gunjō")));
    expect(foldRomaji("toukyou")).toBe(foldRomaji("tookyoo"));
  });
});

describe("searchIndex", () => {
  it("matches Japanese titles by kana in either script, by romaji with or without long vowels, and by width", () => {
    expect(titles("ぐんじょう")[0]).toBe("群青シグナル");
    expect(titles("グンジョウ")[0]).toBe("群青シグナル");
    expect(titles("gunjo")[0]).toBe("群青シグナル");
    expect(titles("群青")[0]).toBe("群青シグナル");
    expect(titles("milk")).toEqual(["Café au Lait"]);
    expect(titles("cafe")).toEqual(["Café au Lait"]);
  });

  it("ranks an exact title above a prefix above a word start above a substring", () => {
    const ranked = searchItems(
      [{ title: "xpandora" }, { title: "the pandora" }, { title: "pandora box" }, { title: "pandora" }],
      [{ get: (song: { title: string }) => song.title }],
      "pandora",
    ).map(song => song.title);
    expect(ranked).toEqual(["pandora", "pandora box", "the pandora", "xpandora"]);
  });

  it("requires every token to match somewhere, across fields", () => {
    expect(titles("pandora sakuzyo")).toEqual(["PANDORA PARADOXXX"]);
    expect(titles("pandora someone")).toEqual([]);
  });

  it("matches a level literally, keeping its plus and decimal point", () => {
    expect(titles("13+")).toEqual(["群青シグナル"]);
    expect(titles("14.2")).toEqual(["Fragrance"]);
    expect(titles("12")).toEqual(["Pandemonium"]);
  });

  it("tolerates a typo in a longer word but not in a short one", () => {
    expect(titles("fragrence")).toEqual(["Fragrance"]);
    expect(titles("frx")).toEqual([]);
  });

  it("matches a title without spaces through the query joined together", () => {
    expect(titles("群青 シグナル")[0]).toBe("群青シグナル");
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(titles("   ")).toEqual([]);
    const index = createSearchIndex(songs, fields);
    expect(searchIndex(index, "a", { limit: 2 })).toHaveLength(2);
    expect(parseSearchQuery("  ＡＢＣ  def ")).toMatchObject([{ raw: "abc" }, { raw: "def" }]);
  });
});
