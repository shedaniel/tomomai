import { DEFAULT_FRONTEND_GAME, type CanonicalGameId } from "./ids";
import { gameIdSchema } from "./schema";

// Must match the PORT of the root package.json dev scripts (dev:mai, dev:chu).
export const DEV_PORTS: Record<CanonicalGameId, number> = {
  maimai: 3000,
  chunithm: 3001,
};

export function resolveFrontendGame(value: string | undefined): CanonicalGameId {
  if (value === undefined) return DEFAULT_FRONTEND_GAME;
  const result = gameIdSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid FRONTEND_GAME. Expected one of: ${gameIdSchema.options.join(", ")}.`);
  return result.data;
}

export function getFrontendDistDir(game: CanonicalGameId, development: boolean): string {
  return development && game !== DEFAULT_FRONTEND_GAME ? `.next-${game}` : ".next";
}
