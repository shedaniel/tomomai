import { describe, expect, it } from "vitest";
import { calculateProgress, parseStatusStates, serializeStatusStates, songDataDifficulty, songDataState } from "./fetch-states";
import { GAME_CODES } from "./games/codes";
import { getGame } from "./games/registry";
import type { CanonicalGameId } from "./games/ids";

describe("fetch states", () => {
  it("names a difficulty's stage after its code key", () => {
    expect(songDataState("maimai", 0)).toBe("song_data:basic");
    expect(songDataState("maimai", 5)).toBe("song_data:utage");
    expect(songDataState("chunithm", 4)).toBe("song_data:ultima");
    expect(() => songDataState("chunithm", 9)).toThrow("Unknown chunithm difficulty code: 9");
  });

  it("reads a song data stage back as the game's difficulty code", () => {
    expect(songDataDifficulty("maimai", "song_data:remaster")).toBe(4);
    expect(songDataDifficulty("chunithm", "song_data:remaster")).toBeNull();
  });

  it.each<{ game: CanonicalGameId; unfetched: readonly string[] }>([
    { game: "maimai", unfetched: [] },
    { game: "chunithm", unfetched: ["worlds-end"] },
  ])("gives $game a song data stage for each fetched difficulty, in code order", ({ game, unfetched }) => {
    const keys: readonly string[] = GAME_CODES[game].difficulty;
    const stages = getGame(game).fetchStages.filter(stage => stage.startsWith("song_data:"));
    expect(stages).toEqual(keys.flatMap((key, code) => unfetched.includes(key) ? [] : [songDataState(game, code)]));
  });

  it("keeps known stages once, reads the earlier maimai BASIC name and drops anything else", () => {
    expect(parseStatusStates(" login ,song_data:easy,song_data:basic,unknown,song_data:ultima")).toEqual(["login", "song_data:basic", "song_data:ultima"]);
    expect(parseStatusStates("")).toEqual([]);
    expect(parseStatusStates(null)).toEqual([]);
    expect(serializeStatusStates(["login", "song_data:basic"])).toBe("login,song_data:basic");
  });

  it("measures progress against the game's own stages", () => {
    expect(calculateProgress(getGame("chunithm").fetchStages, "chunithm")).toBe(100);
    expect(calculateProgress(["login", "hidden_songs"], "chunithm")).toBe(13);
    expect(calculateProgress(["login", "hidden_songs"], "maimai")).toBe(18);
  });
});
