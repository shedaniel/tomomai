import { describe, expect, it } from "vitest";
import { GAME_CODES, codeOf } from "./codes";
import { type Region, CANONICAL_GAME_IDS } from "./ids";
import { getSupportedRegions } from "./regions";
import { getGame } from "./registry";
import { getGameSite } from "./sites";
import { GAME_CAPABILITIES, type GameSite, type LoginMethod } from "./types";

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

  it.each(CANONICAL_GAME_IDS)("lists %s recommendation targets nearest first under unique labels", game => {
    const { rating, recommendations } = getGame(game);
    const master = codeOf(game, "difficulty", "master");
    const versions = new Set(getSupportedRegions(game).flatMap(region => getGame(game).versions.available(region).map(version => version.id)));
    for (const version of versions) {
      const targets = recommendations.targets(version);
      const ratings = targets.map(({ scoreValue, comboStatus }) => rating.chartRating({ scoreValue, comboStatus, levelPrecise: 130, difficultyCode: master }, version));
      expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
      expect(new Set(ratings).size).toBe(ratings.length);
      expect(new Set(targets.map(target => target.label)).size).toBe(targets.length);
    }
  });

  it.each(CANONICAL_GAME_IDS)("offers %s logins only on its sites, and gateway cookies only where the site signs in through the gateway", game => {
    for (const [region, methods] of Object.entries(getGame(game).loginMethods) as [Region, readonly LoginMethod[]][]) {
      const site = getGameSite(game, region);
      expect(site).toBeDefined();
      expect(methods.length).toBeGreaterThan(0);
      if (methods.includes("sega-cookie")) expect(site?.aime).toBeDefined();
    }
  });

  it.each(CANONICAL_GAME_IDS)("gives each %s site that takes SEGA tokens exactly one way to sign them in", game => {
    const { loginMethods, sites } = getGame(game);
    for (const [region, site] of Object.entries(sites) as [Region, GameSite][]) {
      const methods = loginMethods[region] ?? [];
      const takesSegaTokens = methods.includes("sega-account") || methods.includes("sega-cookie");
      expect([site.aime, site.segaId].filter(Boolean).length, `${game} ${region}`).toBe(takesSegaTokens ? 1 : 0);
    }
  });
});
