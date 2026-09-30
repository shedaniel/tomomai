import { describe, expect, it } from "vitest";
import { codeOf } from "@/lib/games/codes";
import { matchesScoreQuery } from "./score-query";

const score = (difficulty: "master" | "remaster") => ({
  songName: "Song", artist: "Artist", difficultyCode: codeOf("maimai", "difficulty", difficulty), typeCode: 1, levelPrecise: 145,
});

describe("score search", () => {
  it.each(["remaster", "rem", "re:master"])("finds a maimai Re:MASTER chart by %s", query => {
    expect(matchesScoreQuery("maimai", score("remaster"), query)).toBe(true);
    expect(matchesScoreQuery("maimai", score("master"), query)).toBe(false);
  });

  it.each(["song", "artist", "14.5", "dx", "mas"])("finds a maimai MASTER chart by %s", query => {
    expect(matchesScoreQuery("maimai", score("master"), query)).toBe(true);
  });
});
