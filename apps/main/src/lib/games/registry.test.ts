import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnabledRegions, getSupportedRegions } from "./regions";
import { getGame, requireCapability, resolveGameContext } from "./registry";
import { getGameSite } from "./sites";
import { CANONICAL_GAME_IDS, GAME_CAPABILITIES } from "./types";

afterEach(() => vi.unstubAllEnvs());

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

  it.each(CANONICAL_GAME_IDS)("points the %s cookie login at a site the game has", game => {
    const { cookieLogin } = getGame(game).fetch;
    if (cookieLogin) expect(getGameSite(game, cookieLogin.region)).toBeDefined();
  });

  it("derives supported regions from each game's sites", () => {
    expect(getSupportedRegions("maimai")).toEqual(["intl", "jp", "cn"]);
    expect(getSupportedRegions("chunithm")).toEqual(["intl", "jp"]);
  });
});

describe("game boundaries", () => {
  it("honors explicit empty configuration by disabling the game", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    expect(getEnabledRegions("maimai")).toEqual([]);
    expect(() => resolveGameContext("maimai", "jp", "scores")).toThrow(expect.objectContaining({ code: "GAME_NOT_ENABLED" }));
  });
  it("filters and deduplicates configured regions", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp, invalid, jp,cn");
    expect(getEnabledRegions("maimai")).toEqual(["jp", "cn"]);
    expect(() => resolveGameContext("maimai", "intl", "scores")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
  it("enables CHUNITHM in International and Japan when its variable is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    expect(getEnabledRegions("chunithm")).toEqual(["intl", "jp"]);
    for (const region of ["intl", "jp"] as const) {
      expect(resolveGameContext("chunithm", region, "catalog")).toEqual({ game: "chunithm", region });
      expect(resolveGameContext("chunithm", region, "scores")).toEqual({ game: "chunithm", region });
    }
    expect(() => requireCapability("chunithm", "albums")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }));
    expect(() => resolveGameContext("chunithm", "cn", "scores")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
  it("respects explicit CHUNITHM regions, and an empty value disables player features", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "jp,cn,jp");
    expect(getEnabledRegions("chunithm")).toEqual(["jp"]);
    expect(() => resolveGameContext("chunithm", "intl", "catalog")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "");
    expect(() => resolveGameContext("chunithm", "jp", "scores")).toThrow(expect.objectContaining({ code: "GAME_NOT_ENABLED" }));
    expect(() => requireCapability("chunithm", "catalog")).not.toThrow();
    expect(() => resolveGameContext("chunithm", "jp", "catalog")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION" }));
  });
});
