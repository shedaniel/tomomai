import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANONICAL_GAME_IDS } from "@/lib/games/ids";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const GAME_FOLDERS = CANONICAL_GAME_IDS.flatMap(game => [
  `lib/games/${game}/`,
  `components/games/${game}/`,
  `server/services/games/${game}/`,
  `server/routers/${game}/`,
]);
const GAME = `["'](?:${CANONICAL_GAME_IDS.join("|")})["']`;
const BRANCH = new RegExp(`[!=]==\\s*${GAME}|${GAME}\\s*[!=]==|case\\s+${GAME}\\s*:`, "g");

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map(path => path.split("\\").join("/"))
    .filter(path => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith("test/"))
    .filter(path => !GAME_FOLDERS.some(folder => path.startsWith(folder)));
}

describe("game branching", () => {
  it("keeps game id comparisons inside game folders", () => {
    const branches = Object.fromEntries(sourceFiles().flatMap(path => {
      const count = readFileSync(`${SRC}/${path}`, "utf8").match(BRANCH)?.length ?? 0;
      return count > 0 ? [[path, count]] : [];
    }));
    expect(branches, "Check a capability with supportsGameFeature, read a definition field, or render a GAME_UI slot instead of comparing the game id").toEqual({});
  });
});
