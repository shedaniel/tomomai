import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameIdSchema } from "./schema";
import { DEV_PORTS, getFrontendDistDir, resolveFrontendGame } from "./frontend-config";

describe("frontend process configuration", () => {
  it("defaults only an omitted setting and accepts canonical IDs", () => {
    expect(resolveFrontendGame(undefined)).toBe("maimai");
    for (const game of gameIdSchema.options) expect(resolveFrontendGame(game)).toBe(game);
    for (const value of ["", "maimaidx", "CHUNITHM", "chunithm ", "invalid"])
      expect(() => resolveFrontendGame(value)).toThrow("Invalid FRONTEND_GAME");
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
