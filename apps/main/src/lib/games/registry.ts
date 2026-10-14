import { chunithmDefinition } from "./chunithm/definition";
import type { CanonicalGameId, Region } from "./ids";
import { maimaiDefinition } from "./maimai/definition";
import type { GameDefinition } from "./types";

const GAMES = {
  maimai: maimaiDefinition,
  chunithm: chunithmDefinition,
} as const satisfies { [G in CanonicalGameId]: GameDefinition & { id: G } };

export type GameSiteRegion<G extends CanonicalGameId> = Extract<keyof (typeof GAMES)[G]["sites"], Region>;

export function getGame(id: CanonicalGameId): GameDefinition {
  return GAMES[id];
}
