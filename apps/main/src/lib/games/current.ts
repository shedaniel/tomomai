import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { resolveFrontendGame } from "./frontend-config";
import { toFrontendGame, type FrontendGame } from "./frontend";
import type { CanonicalGameId } from "./ids";
import { getEnabledRegions } from "./regions";
import { getGame } from "./registry";

// FRONTEND_GAME is not inlined into client bundles. It selects rendered pages. Backend and admin
// operations take an explicit game, and catalog writes must name this deployment's game.
export const getCurrentGame = cache((): FrontendGame => {
  const id = resolveFrontendGame(process.env.FRONTEND_GAME);
  return toFrontendGame(getGame(id), getEnabledRegions(id));
});

/**
 * Answers 404 on a site that serves another game, for pages and route handlers that only exist for one game.
 * Next turns the thrown notFound() into a 404 response in route handlers.
 */
export function requireFrontendGame(game: CanonicalGameId): void {
  if (getCurrentGame().id !== game) notFound();
}
