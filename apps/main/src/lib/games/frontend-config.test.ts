import { getGameBrand, getGameRegion } from "./frontend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameIdSchema } from "./schema";
import { getFrontendDistDir, resolveFrontendGame } from "./frontend-config";

vi.mock("server-only", () => ({}));
import { getFrontendGame } from "./frontend-server";

afterEach(() => vi.unstubAllEnvs());

describe("frontend process configuration", () => {
  it("preserves the maimai brand while separating CHUNITHM metadata", () => {
    expect(getGameBrand({ id: "maimai", productName: "tomomai" }).title).toBe("tomomai ともマイ");
    expect(getGameBrand({ id: "chunithm", productName: "tomochu" }).title).toBe("tomochu ともチュウ");
  });

  it("selects a supported region without carrying maimai-only CN into CHUNITHM", () => {
    const game = { id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: false, regions: ["jp", "intl"], capabilities: [] } as const;
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

  it("selects serializable provider metadata without importing the fetch implementation", () => {
    vi.stubEnv("FRONTEND_GAME", "chunithm");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
    const game = getFrontendGame();
    expect(game).toMatchObject({ id: "chunithm", productName: "tomochu", enabled: true, fetchConfigured: true, cookieLoginConfigured: true, regions: ["intl", "jp"] });
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
    expect(game).not.toHaveProperty("adapter");
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
