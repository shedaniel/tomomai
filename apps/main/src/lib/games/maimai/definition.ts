import { GAME_SUPPORTED_REGIONS } from "../regions";
import { SEGA_COOKIE_LOGIN_URL } from "../sites";
import { calculateMaimaiChartRating, selectMaimaiRankings } from "../rating";
import type { GameAdapter } from "../types";
import { maimaiVersionProvider } from "./versions";

export const maimaiDefinition: GameAdapter = {
  game: "maimai",
  capabilities: new Set(["catalog", "scores", "recents", "albums", "events", "rankings", "rating", "plates", "score-details", "profile-icon"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.maimai,
  versions: maimaiVersionProvider,
  fetch: { cookieLogin: { region: "intl", url: SEGA_COOKIE_LOGIN_URL } },
  calculateChartRating({ scoreValue, levelPrecise, difficulty, comboStatus = 0 }, version) {
    return calculateMaimaiChartRating(scoreValue, levelPrecise, difficulty, comboStatus, version);
  },
  selectRankings: selectMaimaiRankings,
};
