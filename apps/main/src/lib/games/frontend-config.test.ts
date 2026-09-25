import { afterEach, describe, expect, it, vi } from "vitest";
import { gameIdSchema } from "./schema";
import { getFrontendDistDir, resolveFrontendGame } from "./frontend-config";

vi.mock("server-only", () => ({}));
import { getFrontendGame } from "./frontend-server";

afterEach(() => vi.unstubAllEnvs());

describe("frontend process configuration", () => {
  it("defaults only an omitted setting and accepts canonical IDs", () => {
    expect(resolveFrontendGame(undefined)).toBe("maimai");
    for (const game of gameIdSchema.options) expect(resolveFrontendGame(game)).toBe(game);
    for (const value of ["", "maimaidx", "CHUNITHM", "chunithm ", "invalid"])
      expect(() => resolveFrontendGame(value)).toThrow("Invalid FRONTEND_GAME");
  });

  it("selects serializable provider metadata without activating CHUNITHM", () => {
    vi.stubEnv("FRONTEND_GAME", "chunithm");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    const game = getFrontendGame();
    expect(game).toMatchObject({ id: "chunithm", productName: "tomochu", enabled: false, fetchConfigured: false, regions: [] });
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
    expect(game).not.toHaveProperty("adapter");
    expect(game.capabilities).not.toContain("scores");
    expect(game.capabilities).not.toContain("catalog");
  });

  it("does not silently resolve an invalid process setting", () => {
    vi.stubEnv("FRONTEND_GAME", "other");
    expect(() => getFrontendGame()).toThrow("Invalid FRONTEND_GAME");
  });

  it("isolates concurrent development output while preserving maimai's directory", () => {
    expect(getFrontendDistDir("maimai", true)).toBe(".next");
    expect(getFrontendDistDir("chunithm", true)).toBe(".next-chunithm");
    for (const game of gameIdSchema.options) expect(getFrontendDistDir(game, false)).toBe(".next");
  });
});
