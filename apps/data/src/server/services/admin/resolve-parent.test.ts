import { describe, expect, it } from "vitest";
import { resolveParents, type ParentState, type SongToParent } from "@tomomai/catalog/resolve-parent";

function song(overrides: Partial<SongToParent> & { id: bigint }): SongToParent {
  return {
    songName: "Tsunagite",
    type: "dx",
    difficulty: "master",
    artist: "HIMEHINA",
    genre: "POPS＆アニメ",
    cover: "c1.webp",
    bpm: 160,
    addedVersion: 8,
    region: "jp",
    gameVersion: 13,
    ...overrides,
  };
}

function parent(overrides: Partial<ParentState>): ParentState {
  return {
    id: BigInt(1),
    songName: "Tsunagite",
    type: "dx",
    difficulty: "master",
    disambiguator: 0,
    artist: "HIMEHINA",
    genre: "POPS＆アニメ",
    cover: "c1.webp",
    bpm: 160,
    childAddedVersions: new Set([8]),
    childRegionVersions: new Set(["jp:13"]),
    ...overrides,
  };
}

describe("resolveParents", () => {
  it("creates a single parent for a brand new chart across regions", () => {
    const result = resolveParents([
      song({ id: BigInt(1), region: "jp", gameVersion: 13 }),
      song({ id: BigInt(2), region: "intl", gameVersion: 13, artist: "HIMEHINA (drifted)" }),
    ], []);

    expect(result.newParents).toHaveLength(1);
    expect(result.assignments.get(BigInt(1))).toBe(result.newParents[0]);
    expect(result.assignments.get(BigInt(2))).toBe(result.newParents[0]);
  });

  it("matches an existing parent by sibling addedVersion", () => {
    const existing = parent({});
    const result = resolveParents([
      song({ id: BigInt(5), region: "intl", gameVersion: 13, addedVersion: 8 }),
    ], [existing]);

    expect(result.newParents).toHaveLength(0);
    expect(result.assignments.get(BigInt(5))).toBe(existing);
  });

  it("reuses the sole parent for a new region with a region-specific addedVersion", () => {
    const existing = parent({});
    const result = resolveParents([
      song({ id: BigInt(5), region: "intl", gameVersion: 13, addedVersion: 9 }),
    ], [existing]);

    expect(result.newParents).toHaveLength(0);
    expect(result.assignments.get(BigInt(5))).toBe(existing);
  });

  it("creates a disambiguated parent for the Link-style duplicate", () => {
    // The first Link already exists; the second arrives in the same region+version
    const existing = parent({
      songName: "Link",
      difficulty: "basic",
      artist: "Circle of friends",
      childAddedVersions: new Set([-12]),
      childRegionVersions: new Set(["jp:13"]),
    });
    const result = resolveParents([
      song({
        id: BigInt(9),
        songName: "Link",
        difficulty: "basic",
        artist: "Clean Tears feat. Youna",
        addedVersion: -11,
        region: "jp",
        gameVersion: 13,
      }),
    ], [existing]);

    expect(result.newParents).toHaveLength(1);
    expect(result.newParents[0].disambiguator).toBe(1);
    expect(result.assignments.get(BigInt(9))).toBe(result.newParents[0]);
  });

  it("resolves both Links arriving in one batch into two parents", () => {
    const result = resolveParents([
      song({ id: BigInt(1), songName: "Link", difficulty: "basic", artist: "Circle of friends", addedVersion: -12 }),
      song({ id: BigInt(2), songName: "Link", difficulty: "basic", artist: "Clean Tears feat. Youna", addedVersion: -11 }),
      song({ id: BigInt(3), songName: "Link", difficulty: "basic", artist: "Circle of friends", addedVersion: -12, gameVersion: 12 }),
    ], []);

    expect(result.newParents).toHaveLength(2);
    expect(result.assignments.get(BigInt(1))).toBe(result.assignments.get(BigInt(3)));
    expect(result.assignments.get(BigInt(1))).not.toBe(result.assignments.get(BigInt(2)));
  });

  it("prefers the artist-matching parent among disambiguated candidates", () => {
    const linkA = parent({
      id: BigInt(1),
      songName: "Link",
      difficulty: "basic",
      artist: "Circle of friends",
      childAddedVersions: new Set([-12]),
      childRegionVersions: new Set(["jp:13"]),
    });
    const linkB = parent({
      id: BigInt(2),
      songName: "Link",
      difficulty: "basic",
      artist: "Clean Tears feat. Youna",
      disambiguator: 1,
      childAddedVersions: new Set([-11]),
      childRegionVersions: new Set(["jp:13"]),
    });
    // First intl instance: intl addedVersion differs from both jp values
    const result = resolveParents([
      song({
        id: BigInt(9),
        songName: "Link",
        difficulty: "basic",
        artist: "Clean Tears feat. Youna",
        addedVersion: 2,
        region: "intl",
        gameVersion: 13,
      }),
    ], [linkA, linkB]);

    expect(result.newParents).toHaveLength(0);
    expect(result.assignments.get(BigInt(9))).toBe(linkB);
  });
});
