import { readFileSync } from "node:fs";
import { brandTitle, getGameRegion, toFrontendGame } from "./frontend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameIdSchema } from "./schema";
import { DEV_PORTS, getFrontendDistDir, resolveFrontendGame } from "./frontend-config";
import { getCurrentGame } from "./current";
import { getGame } from "./registry";

afterEach(() => vi.unstubAllEnvs());

describe("frontend process configuration", () => {
  it("preserves the maimai brand while separating CHUNITHM metadata", () => {
    expect(brandTitle(getGame("maimai").brand)).toBe("tomomai ともマイ");
    expect(brandTitle(getGame("chunithm").brand)).toBe("tomochu ともチュウ");
  });

  it("selects a supported region without carrying maimai-only CN into CHUNITHM", () => {
    const game = toFrontendGame(getGame("chunithm"), ["jp", "intl"]);
    expect(getGameRegion(game, "cn")).toBe("jp");
    expect(getGameRegion(game, "intl")).toBe("intl");
    expect(getGameRegion({ ...game, regions: [] }, "jp")).toBeNull();
  });
  it("defaults only an omitted setting and accepts canonical IDs", () => {
    expect(resolveFrontendGame(undefined)).toBe("maimai");
    for (const game of gameIdSchema.options) expect(resolveFrontendGame(game)).toBe(game);
    for (const value of ["", "maimaidx", "CHUNITHM", "chunithm ", "invalid"])
      expect(() => resolveFrontendGame(value)).toThrow("Invalid FRONTEND_GAME");
  });

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
      regions: ["intl", "jp"],
    });
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
  });

  it("does not silently resolve an invalid process setting", () => {
    vi.stubEnv("FRONTEND_GAME", "other");
    expect(() => getCurrentGame()).toThrow("Invalid FRONTEND_GAME");
  });

  it("isolates concurrent development output while preserving maimai's directory", () => {
    expect(getFrontendDistDir("maimai", true)).toBe(".next");
    expect(getFrontendDistDir("chunithm", true)).toBe(".next-chunithm");
    for (const game of gameIdSchema.options) expect(getFrontendDistDir(game, false)).toBe(".next");
  });

  it("keeps every development output inside the build directories ESLint ignores", () => {
    for (const game of gameIdSchema.options) expect(getFrontendDistDir(game, true)).toMatch(/^\.next(-[a-z]+)?$/);
  });

  it("serves each game's development script on its own declared port", () => {
    const { scripts } = JSON.parse(readFileSync(new URL("../../../../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    const ports = Object.values(scripts).flatMap(script => {
      const match = /FRONTEND_GAME=(\S+) PORT=(\d+)/.exec(script);
      return match ? [[match[1], Number(match[2])] as const] : [];
    });
    expect(Object.fromEntries(ports)).toEqual(DEV_PORTS);
    expect(new Set(Object.values(DEV_PORTS)).size).toBe(gameIdSchema.options.length);
  });
});
