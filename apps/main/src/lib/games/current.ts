import "server-only";
import { cache } from "react";
import { resolveFrontendGame } from "./frontend-config";
import { toFrontendGame, type FrontendGame } from "./frontend";
import { getEnabledRegions } from "./regions";
import { getGame } from "./registry";

// FRONTEND_GAME is not inlined into client bundles. It selects rendered pages only, and
// admin and backend operations take an explicit game on a shared instance.
export const getCurrentGame = cache((): FrontendGame => {
  const id = resolveFrontendGame(process.env.FRONTEND_GAME);
  return toFrontendGame(getGame(id), getEnabledRegions(id));
});
