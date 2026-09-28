/**
 * Cabinet titles a store listing can offer. This list is independent of the
 * games the app tracks scores for (lib/games).
 */

export const ARCADE_GAMES = [
  "maimai",
  "maimaidx",
  "chunithm",
  "ongeki",
  "sdvx",
  "taiko",
  "iidx",
  "jubeat",
  "ddr",
  "wacca",
] as const;

const DEFAULT_NAMES = {
  "maimai": "maimai",
  "maimaidx": "maimai DX",
  "chunithm": "CHUNITHM",
  "ongeki": "オンゲキ",
  "sdvx": "SOUND VOLTEX",
  "taiko": "太鼓の達人",
  "iidx": "beatmania IIDX",
  "jubeat": "jubeat",
  "ddr": "DanceDanceRevolution",
  "wacca": "WACCA",
}

export type ArcadeGameId = typeof ARCADE_GAMES[number];

type TranslationFunction = (key: string) => string;

/**
 * Get localized game name from i18n translations
 * Falls back to the game ID if translation doesn't exist
 * @param t - i18n translation function from useTranslations
 * @param gameId - The game identifier
 * @returns Localized game name or game ID as fallback
 */
export function getArcadeGameName(t: TranslationFunction, gameId: ArcadeGameId): string {
  const key = `games.${gameId}`;
  const translated = t(key);

  if (translated === key) {
    return DEFAULT_NAMES[gameId];
  }

  return translated;
}

/**
 * Get all games with their localized names
 * @param t - i18n translation function from useTranslations
 * @returns Array of games with their IDs and localized names
 */
export function getAllArcadeGames(t: TranslationFunction): Array<{ id: ArcadeGameId; name: string }> {
  return ARCADE_GAMES.map(gameId => ({
    id: gameId,
    name: getArcadeGameName(t, gameId),
  }));
}
