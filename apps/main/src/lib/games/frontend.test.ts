import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveGameContext } from "./access";
import { supportsGameFeature, toFrontendGame } from "./frontend";
import { REGIONS, type CanonicalGameId, type Region } from "./ids";
import { getEnabledRegions } from "./regions";
import { getGame } from "./registry";
import { GAME_CAPABILITIES, type GameCapability } from "./types";

afterEach(() => vi.unstubAllEnvs());

function serverAccepts(game: CanonicalGameId, capability: GameCapability, region?: Region) {
  try {
    resolveGameContext(game, { region, capability });
    return true;
  } catch {
    return false;
  }
}

describe("client capability gating", () => {
  it.each([
    { maimai: "intl,jp,cn", chunithm: "intl,jp" },
    { maimai: "cn", chunithm: "jp" },
    { maimai: "", chunithm: "" },
  ])("offers exactly what the server accepts with maimai $maimai and CHUNITHM $chunithm enabled", config => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", config.maimai);
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", config.chunithm);
    for (const id of ["maimai", "chunithm"] as const) {
      const game = toFrontendGame(getGame(id), getEnabledRegions(id));
      for (const capability of GAME_CAPABILITIES) {
        expect(supportsGameFeature(game, capability), `${id} ${capability}`).toBe(serverAccepts(id, capability));
        for (const region of REGIONS) {
          expect(supportsGameFeature(game, capability, region), `${id} ${capability} ${region}`).toBe(serverAccepts(id, capability, region));
        }
      }
    }
  });

  it("withdraws maimai albums in China while other regions keep them", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
    const game = toFrontendGame(getGame("maimai"), getEnabledRegions("maimai"));
    expect(supportsGameFeature(game, "albums", "cn")).toBe(false);
    expect(supportsGameFeature(game, "albums", "jp")).toBe(true);
    expect(supportsGameFeature(game, "albums")).toBe(true);
  });

  it("refuses to serve a game without its catalog", () => {
    const definition = getGame("chunithm");
    expect(() => toFrontendGame({ ...definition, capabilities: definition.capabilities.filter(capability => capability !== "catalog") }, ["jp"]))
      .toThrow("CHUNITHM cannot be served without its catalog");
  });
});
