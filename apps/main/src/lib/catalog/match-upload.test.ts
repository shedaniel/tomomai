import { describe, expect, it } from "vitest";
import { findDuplicateUpload, matchUpload } from "./match-upload";

const chart = (artist: string, addedVersion: number) => ({ songName: "Link", artist, addedVersion, type: "std" as const, difficulty: "master" as const });

describe("matchUpload", () => {
  it("preserves artist identity when colliding charts exchange addedVersion values", () => {
    expect(matchUpload([chart("Circle of friends", -1), chart("Clean Tears", -9)], [chart("Clean Tears", -1), chart("Circle of friends", -9)]))
      .toEqual(new Map([[0, 1], [1, 0]]));
  });

  it("reserves exact matches before handling artist drift", () => {
    expect(matchUpload([chart("A", 1), chart("B", 2)], [chart("renamed A", 2), chart("B", 2)]))
      .toEqual(new Map([[1, 1], [0, 0]]));
  });

  it("does not merge two incoming charts into one child", () => {
    expect(matchUpload([chart("A", 1)], [chart("A", 1), chart("B", 2)]))
      .toEqual(new Map([[0, 0]]));
  });

  it("leaves ambiguous collisions unmatched", () => {
    expect(matchUpload([chart("A", 1), chart("B", 1)], [chart("C", 1)]).size).toBe(0);
  });

  it("matches a sole chart after both artist and version drift", () => {
    expect(matchUpload([chart("A", 1)], [chart("renamed A", 2)]))
      .toEqual(new Map([[0, 0]]));
  });

  it("does not match across chart types or difficulties", () => {
    expect(matchUpload([chart("A", 1)], [{ ...chart("A", 1), type: "dx" }, { ...chart("A", 1), difficulty: "expert" }]).size).toBe(0);
  });
});

describe("findDuplicateUpload", () => {
  it("rejects repeated identities even when chart metadata differs", () => {
    const original = { ...chart("A", 1), levelPrecise: 140 };
    expect(findDuplicateUpload([original, { ...original }])).toBe(1);
    expect(findDuplicateUpload([original, chart("B", 2), { ...original, levelPrecise: 141 }])).toBe(2);
  });

  it("preserves distinct artists, versions, types and difficulties", () => {
    expect(findDuplicateUpload([
      chart("A", 1), chart("B", 1), chart("A", 2),
      { ...chart("A", 1), type: "dx" },
      { ...chart("A", 1), difficulty: "expert" },
    ])).toBeUndefined();
    expect(findDuplicateUpload([])).toBeUndefined();
  });
});
