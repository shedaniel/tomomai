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

// Branches outside game folders that are still waiting for their replacement, with how many each file holds.
// Delete an entry once its file no longer branches, and never add one.
const PENDING: Record<string, number> = {
  // OG images and page metadata become brand-aware for every game.
  "app/[locale]/db/[type]/opengraph-image.tsx": 1,
  "app/[locale]/db/[type]/page.tsx": 1,
  "app/[locale]/db/opengraph-image.tsx": 1,
  "app/[locale]/profile/[username]/[region]/opengraph-image.tsx": 1,
  "app/[locale]/profile/[username]/[region]/page.tsx": 1,
  // The header logo moves onto the brand.
  "components/header.tsx": 1,
  // Recent plays carry one per-game details field.
  "components/player/recent-songs-card.tsx": 2,
  "server/queries/recents.ts": 1,
  // Recommendation targets move onto the definitions.
  "components/player/recommendation-card.tsx": 1,
  "components/player/recommendation-filters.ts": 2,
  "lib/games/recommendations.ts": 4,
  // The legacy catalog upload shape moves behind the game's catalog provider.
  "server/services/catalog/ingestion/parse-upload.ts": 1,
  // The insecure TLS choice becomes a site property.
  "server/services/games/sega/http.ts": 1,
};

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
    expect(branches, "Check a capability with supportsGameFeature, read a definition field, or render a GAME_UI slot instead of comparing the game id").toEqual(PENDING);
  });
});
