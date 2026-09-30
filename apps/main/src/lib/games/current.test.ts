import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentGame } from "./current";
import { getGame } from "./registry";

afterEach(() => vi.unstubAllEnvs());

describe("the served game", () => {
  it("describes the configured game with serializable definition facts and its enabled regions", () => {
    vi.stubEnv("FRONTEND_GAME", "chunithm");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    const game = getCurrentGame();
    expect(game).toEqual({
      id: "chunithm",
      brand: getGame("chunithm").brand,
      capabilities: getGame("chunithm").capabilities,
      regionCapabilityOverrides: {},
      catalogSections: [{ id: "songs", requires: "catalog" }],
      loginMethods: { intl: ["sega-cookie", "sega-account"], jp: ["sega-account"] },
      catalogTokenRegions: [],
      normalizesCatalogTitles: false,
      regions: ["intl", "jp"],
    });
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
  });

  it("does not silently resolve an invalid process setting", () => {
    vi.stubEnv("FRONTEND_GAME", "other");
    expect(() => getCurrentGame()).toThrow("Invalid FRONTEND_GAME");
  });
});
