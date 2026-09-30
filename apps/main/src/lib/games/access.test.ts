import { afterEach, describe, expect, it, vi } from "vitest";
import { hasCapability, resolveGameContext } from "./access";
import { CANONICAL_GAME_IDS, REGIONS } from "./ids";
import { getEnabledRegions } from "./regions";
import { GAME_CAPABILITIES } from "./types";

afterEach(() => vi.unstubAllEnvs());

const rejected = (code: string) => expect.objectContaining({ code });

describe("game access", () => {
  it("honors explicit empty configuration by disabling the game", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    expect(getEnabledRegions("maimai")).toEqual([]);
    expect(() => resolveGameContext("maimai", { region: "jp", capability: "scores" })).toThrow(rejected("GAME_NOT_ENABLED"));
    expect(() => resolveGameContext("maimai", { capability: "scores" })).toThrow(rejected("GAME_NOT_ENABLED"));
  });

  it("filters and deduplicates configured regions", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp, invalid, jp,cn");
    expect(getEnabledRegions("maimai")).toEqual(["jp", "cn"]);
    expect(() => resolveGameContext("maimai", { region: "intl", capability: "scores" })).toThrow(rejected("UNSUPPORTED_REGION"));
  });

  it("enables CHUNITHM in International and Japan when its variable is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    expect(getEnabledRegions("chunithm")).toEqual(["intl", "jp"]);
    for (const region of ["intl", "jp"] as const) {
      expect(resolveGameContext("chunithm", { region, capability: "catalog" })).toEqual({ game: "chunithm", region });
      expect(resolveGameContext("chunithm", { region, capability: "scores" })).toEqual({ game: "chunithm", region });
    }
    expect(() => resolveGameContext("chunithm", { capability: "albums" })).toThrow(rejected("UNSUPPORTED_CAPABILITY"));
    expect(() => resolveGameContext("chunithm", { region: "cn", capability: "scores" })).toThrow(rejected("UNSUPPORTED_REGION"));
  });

  it("respects explicit CHUNITHM regions, and an empty value disables player features but not the catalog", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "jp,cn,jp");
    expect(getEnabledRegions("chunithm")).toEqual(["jp"]);
    expect(() => resolveGameContext("chunithm", { region: "intl", capability: "catalog" })).toThrow(rejected("UNSUPPORTED_REGION"));
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "");
    expect(() => resolveGameContext("chunithm", { region: "jp", capability: "scores" })).toThrow(rejected("GAME_NOT_ENABLED"));
    expect(resolveGameContext("chunithm", { capability: "catalog" })).toEqual({ game: "chunithm" });
    expect(() => resolveGameContext("chunithm", { region: "jp", capability: "catalog" })).toThrow(rejected("UNSUPPORTED_REGION"));
  });

  it("lets catalog administration reach every region the game has a site for, enabled or not", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "");
    expect(() => resolveGameContext("maimai", { region: "cn", capability: "catalog" })).toThrow(rejected("UNSUPPORTED_REGION"));
    expect(resolveGameContext("maimai", { region: "cn", capability: "catalog", regionPolicy: "supported" })).toEqual({ game: "maimai", region: "cn" });
    expect(resolveGameContext("chunithm", { region: "intl", capability: "catalog", regionPolicy: "supported" })).toEqual({ game: "chunithm", region: "intl" });
    expect(() => resolveGameContext("chunithm", { region: "cn", capability: "catalog", regionPolicy: "supported" })).toThrow(rejected("UNSUPPORTED_REGION"));
  });

  it("withdraws maimai albums in China only", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
    expect(() => resolveGameContext("maimai", { region: "cn", capability: "albums" })).toThrow(rejected("UNSUPPORTED_CAPABILITY"));
    expect(resolveGameContext("maimai", { region: "cn", capability: "scores" })).toEqual({ game: "maimai", region: "cn" });
    expect(resolveGameContext("maimai", { region: "intl", capability: "albums" })).toEqual({ game: "maimai", region: "intl" });
    expect(resolveGameContext("maimai", { capability: "albums" })).toEqual({ game: "maimai" });
  });

  it.each(["", "intl,jp,cn"])("answers hasCapability exactly when resolveGameContext accepts (regions %j)", regions => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", regions);
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", regions);
    for (const game of CANONICAL_GAME_IDS) {
      for (const capability of GAME_CAPABILITIES) {
        for (const region of [undefined, ...REGIONS]) {
          let accepted = true;
          try {
            resolveGameContext(game, { region, capability });
          } catch {
            accepted = false;
          }
          expect(hasCapability(game, capability, region), `${game} ${capability} ${region}`).toBe(accepted);
        }
      }
    }
    expect(hasCapability("maimai", "scores")).toBe(regions !== "");
  });
});
