import { describe, expect, it } from "vitest";
import { formatSongInstanceId, parseSongId, parentPublicIdOf } from "@tomomai/catalog/song-instance-id";

describe("song instance ids", () => {
  it("round-trips all regions and negative versions", () => {
    for (const [region, version] of [["jp", 11], ["intl", 12], ["cn", 10], ["jp", -12], ["intl", 0]] as const) {
      const id = formatSongInstanceId("abcd", region, version);
      expect(parseSongId(id)).toEqual({ kind: "instance", parentPublicId: "abcd", region, gameVersion: version });
    }
  });

  it("formats per the spec", () => {
    expect(formatSongInstanceId("abcd", "jp", 11)).toBe("abcd:j11");
    expect(formatSongInstanceId("abcd", "intl", 12)).toBe("abcd:i12");
    expect(formatSongInstanceId("abcd", "cn", -1)).toBe("abcd:c-1");
  });

  it("parses bare ids as chart ids", () => {
    expect(parseSongId("abcd")).toEqual({ kind: "parent", parentPublicId: "abcd" });
  });

  it("rejects malformed ids", () => {
    for (const bad of ["", ":j11", "abcd:", "abcd:x11", "abcd:j", "abcd:j1.5", "abcd:jp11", "abcd:j--1"]) {
      expect(parseSongId(bad)).toBeNull();
    }
  });

  it("truncates composite ids to the chart id", () => {
    expect(parentPublicIdOf("abcd:j11")).toBe("abcd");
    expect(parentPublicIdOf("abcd")).toBe("abcd");
  });
});
