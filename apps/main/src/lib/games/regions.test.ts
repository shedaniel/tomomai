import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: logError } }));

import { getEnabledRegions, getSupportedRegions } from "./regions";
import { requireGameSite } from "./sites";

const ENV = {
  maimai: "NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS",
  chunithm: "NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS",
  legacy: "NEXT_PUBLIC_ENABLED_REGIONS",
} as const;

function configure(values: Partial<Record<keyof typeof ENV, string>>) {
  for (const [key, name] of Object.entries(ENV)) vi.stubEnv(name, values[key as keyof typeof ENV]);
}

beforeEach(() => logError.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe("supported regions", () => {
  it("derives each game's regions from its sites", () => {
    expect(getSupportedRegions("maimai")).toEqual(["intl", "jp", "cn"]);
    expect(getSupportedRegions("chunithm")).toEqual(["intl", "jp"]);
  });

  it("rejects a region the game has no site for", () => {
    expect(() => requireGameSite("maimai", "cn")).not.toThrow();
    expect(() => requireGameSite("chunithm", "cn")).toThrow(expect.objectContaining({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" }));
  });
});

describe("enabled regions", () => {
  it.each(["maimai", "chunithm"] as const)("enables every %s region except CN when its variable is unset", game => {
    configure({});
    expect(getEnabledRegions(game)).toEqual(["intl", "jp"]);
  });

  it.each(["maimai", "chunithm"] as const)("disables %s for a blank value", game => {
    configure({ [game]: "", legacy: "jp" });
    expect(getEnabledRegions(game)).toEqual([]);
    configure({ [game]: " , " });
    expect(getEnabledRegions(game)).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  it("trims, filters and deduplicates a listed value in its own order", () => {
    configure({ maimai: " cn, invalid,jp,cn ", chunithm: "jp,cn,intl" });
    expect(getEnabledRegions("maimai")).toEqual(["cn", "jp"]);
    expect(getEnabledRegions("chunithm")).toEqual(["jp", "intl"]);
    expect(logError).not.toHaveBeenCalled();
  });

  it("falls back to the legacy maimai variable only while the maimai one is unset", () => {
    configure({ legacy: "cn" });
    expect(getEnabledRegions("maimai")).toEqual(["cn"]);
    expect(getEnabledRegions("chunithm")).toEqual(["intl", "jp"]);
    configure({ maimai: "jp", legacy: "cn" });
    expect(getEnabledRegions("maimai")).toEqual(["jp"]);
    configure({ legacy: "" });
    expect(getEnabledRegions("maimai")).toEqual(["intl", "jp"]);
  });

  it("disables a game whose value names no supported region and logs it once per game", () => {
    configure({ maimai: "global", chunithm: "cn" });
    expect(getEnabledRegions("chunithm")).toEqual([]);
    expect(getEnabledRegions("chunithm")).toEqual([]);
    expect(getEnabledRegions("maimai")).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith({ game: "chunithm", value: "cn" }, expect.any(String));
    expect(logError).toHaveBeenCalledWith({ game: "maimai", value: "global" }, expect.any(String));
  });
});
