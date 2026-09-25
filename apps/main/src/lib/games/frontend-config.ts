import { gameIdSchema } from "./schema";
import type { CanonicalGameId } from "./types";

export function resolveFrontendGame(value: string | undefined): CanonicalGameId {
  if (value === undefined) return "maimai";
  const result = gameIdSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid FRONTEND_GAME. Expected one of: ${gameIdSchema.options.join(", ")}.`);
  return result.data;
}

export function getFrontendDistDir(game: CanonicalGameId, development: boolean): string {
  return development && game !== "maimai" ? `.next-${game}` : ".next";
}
