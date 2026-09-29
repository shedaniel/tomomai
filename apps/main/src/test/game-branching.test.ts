import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { offersCapability } from "@/lib/games/capabilities";
import { CANONICAL_GAME_IDS, type CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import type { GameCapability } from "@/lib/games/types";

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
  // Recent plays carry one per-game details field.
  "components/player/recent-songs-card.tsx": 2,
  "server/queries/recents.ts": 1,
  // Recommendation targets move onto the definitions.
  "components/player/recommendation-card.tsx": 1,
  "components/player/recommendation-filters.ts": 2,
  "lib/games/recommendations.ts": 4,
};

// Shared hosts gate these features by capability but render the owner's component or call its trpc router,
// so a second game would get the owner's UI. Give the host a GAME_UI slot before another game declares one.
const SINGLE_GAME_FEATURES = {
  "rating-plate": "maimai",
  assistant: "maimai",
  minigames: "maimai",
  "community-banner": "maimai",
  stats: "maimai",
  "image-export": "maimai",
  "developer-export": "maimai",
  events: "maimai",
  albums: "maimai",
  percentiles: "maimai",
  "snapshot-copy": "maimai",
  "score-details": "maimai",
} as const satisfies Partial<Record<GameCapability, CanonicalGameId>>;

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

  it("lets only the owning game declare a feature whose shared host renders one game's UI", () => {
    const features = Object.entries(SINGLE_GAME_FEATURES) as [GameCapability, CanonicalGameId][];
    const declaredBy = Object.fromEntries(features.map(([capability]) => [
      capability,
      CANONICAL_GAME_IDS.filter(game => offersCapability(getGame(game), capability)),
    ]));
    expect(declaredBy, "Render a GAME_UI slot in the shared host, then drop the feature from SINGLE_GAME_FEATURES")
      .toEqual(Object.fromEntries(features.map(([capability, owner]) => [capability, [owner]])));
  });
});
