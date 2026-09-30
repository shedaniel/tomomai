import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { offersCapability } from "@/lib/games/capabilities";
import { CANONICAL_GAME_IDS, type CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import type { CatalogSectionId, GameCapability } from "@/lib/games/types";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const GAME_FOLDERS = CANONICAL_GAME_IDS.flatMap(game => [
  `lib/games/${game}/`,
  `components/games/${game}/`,
  `server/services/games/${game}/`,
  `server/routers/${game}/`,
]);
const GAME = `["'](?:${CANONICAL_GAME_IDS.join("|")})["']`;
const BRANCH = new RegExp(`[!=]==\\s*${GAME}|${GAME}\\s*[!=]==|case\\s+${GAME}\\s*:`, "g");

// Shared hosts gate these features by capability but render the owner's component, call its trpc router or
// call its server service, so a second game would get the owner's behaviour. Give the host a GAME_UI slot or
// a per-game server hook before another game declares one.
const SINGLE_GAME_FEATURES = {
  plates: "maimai",
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
  "note-counts": "maimai",
} as const satisfies Partial<Record<GameCapability, CanonicalGameId>>;

// /db sections whose view (app/[locale]/db/[type]/sections.tsx) or content belongs to one game.
const SINGLE_GAME_SECTIONS = {
  stats: "maimai",
  events: "maimai",
  arcades: "maimai",
  // The changelog is tomomai's.
  posts: "maimai",
} as const satisfies Partial<Record<CatalogSectionId, CanonicalGameId>>;

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

  it("lets only the owning game declare a feature whose shared host serves one game's implementation", () => {
    const features = Object.entries(SINGLE_GAME_FEATURES) as [GameCapability, CanonicalGameId][];
    const declaredBy = Object.fromEntries(features.map(([capability]) => [
      capability,
      CANONICAL_GAME_IDS.filter(game => offersCapability(getGame(game), capability)),
    ]));
    expect(declaredBy, "Render a GAME_UI slot or call a per-game server hook in the shared host, then drop the feature from SINGLE_GAME_FEATURES")
      .toEqual(Object.fromEntries(features.map(([capability, owner]) => [capability, [owner]])));
  });

  it("lets only the owning game declare a /db section that shows one game's content", () => {
    const sections = Object.entries(SINGLE_GAME_SECTIONS) as [CatalogSectionId, CanonicalGameId][];
    const declaredBy = Object.fromEntries(sections.map(([section]) => [
      section,
      CANONICAL_GAME_IDS.filter(game => getGame(game).catalogSections.some(({ id }) => id === section)),
    ]));
    expect(declaredBy, "Give the section a view per game, then drop it from SINGLE_GAME_SECTIONS")
      .toEqual(Object.fromEntries(sections.map(([section, owner]) => [section, [owner]])));
  });
});
