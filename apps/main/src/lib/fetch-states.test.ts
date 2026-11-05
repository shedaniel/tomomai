import { describe, expect, it } from "vitest";
import { parseStatusStates, serializeStatusStates } from "./fetch-states";

describe("fetch states", () => {
  it("keeps known stages once, reads the earlier maimai BASIC name and drops anything else", () => {
    expect(parseStatusStates(" login ,song_data:easy,song_data:basic,unknown,song_data:ultima")).toEqual(["login", "song_data:basic", "song_data:ultima"]);
    expect(parseStatusStates("")).toEqual([]);
    expect(parseStatusStates(null)).toEqual([]);
    expect(serializeStatusStates(["login", "song_data:basic"])).toBe("login,song_data:basic");
  });
});
