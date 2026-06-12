/**
 * The game whose data a request operates on. Surfaced as the `[game]` path
 * segment in `/api/v1/{game}/...` routes.
 */
export type Game = "maimai";

/**
 * Get the list of enabled games from the NEXT_PUBLIC_ENABLED_GAMES environment
 * variable.
 *
 * @returns Array of enabled games
 * @default ["maimai"]
 *
 * @example
 * ```ts
 * const games = getEnabledGames(); // ["maimai"]
 * ```
 */
export function getEnabledGames(): Game[] {
  const envValue = process.env.NEXT_PUBLIC_ENABLED_GAMES;

  if (!envValue) {
    return ["maimai"];
  }

  const games = envValue
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g === "maimai") as Game[];

  // If no valid games found, return default
  if (games.length === 0) {
    return ["maimai"];
  }

  return games;
}

/**
 * Check if a specific game is enabled.
 *
 * @param game - The game to check
 * @returns True if the game is enabled
 */
export function isGameEnabled(game: string): game is Game {
  return getEnabledGames().includes(game as Game);
}
