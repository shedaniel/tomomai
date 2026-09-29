import { describe, expect, it } from "vitest";
import { GAME_CODES } from "./codes";
import { getSupportedRegions } from "./regions";
import { getGame } from "./registry";
import { getGameSite } from "./sites";
import { CANONICAL_GAME_IDS, GAME_CAPABILITIES } from "./types";

describe("game definitions", () => {
  it.each(CANONICAL_GAME_IDS)("registers %s under its own id", game => {
    expect(getGame(game).id).toBe(game);
  });

  it.each(CANONICAL_GAME_IDS)("starts %s fetch stages with login and player data", game => {
    const stages = getGame(game).fetchStages;
    expect(stages.slice(0, 2)).toEqual(["login", "player_data"]);
    expect(new Set(stages).size).toBe(stages.length);
  });

  it.each(CANONICAL_GAME_IDS)("declares only known capabilities for %s", game => {
    const { capabilities } = getGame(game);
    for (const capability of capabilities) expect(GAME_CAPABILITIES).toContain(capability);
    expect(capabilities).toContain("catalog");
  });

  it.each(CANONICAL_GAME_IDS)("withdraws %s capabilities only from regions it has, and only ones it offers", game => {
    const { capabilities, regionCapabilityOverrides = {} } = getGame(game);
    for (const [region, withdrawn] of Object.entries(regionCapabilityOverrides)) {
      expect(getSupportedRegions(game)).toContain(region);
      for (const capability of withdrawn ?? []) expect(capabilities).toContain(capability);
    }
  });

  it.each([
    { game: "maimai", unrated: ["utage"] },
    { game: "chunithm", unrated: ["worlds-end"] },
  ] as const)("rates every $game difficulty except $unrated", ({ game, unrated }) => {
    const { isRated } = getGame(game).rating;
    expect(GAME_CODES[game].difficulty.filter((_, code) => !isRated(code))).toEqual(unrated);
  });

  it.each(CANONICAL_GAME_IDS)("points the %s cookie login at a site that signs in through the SEGA Aime gateway", game => {
    const { cookieLogin } = getGame(game).fetch;
    if (cookieLogin) expect(getGameSite(game, cookieLogin.region)?.aime).toBeDefined();
  });
});
