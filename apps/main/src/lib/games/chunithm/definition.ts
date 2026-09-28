import { GAME_SUPPORTED_REGIONS } from "../regions";
import { SEGA_COOKIE_LOGIN_URL } from "../sites";
import { calculateChunithmChartRating, selectChunithmRankings } from "../rating";
import type { GameAdapter } from "../types";
import { chunithmVersionProvider } from "./versions";

export const chunithmDefinition: GameAdapter = {
  game: "chunithm",
  capabilities: new Set(["catalog", "scores", "recents", "rankings", "rating", "profile-icon"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.chunithm,
  versions: chunithmVersionProvider,
  fetch: { cookieLogin: { region: "intl", url: SEGA_COOKIE_LOGIN_URL } },
  calculateChartRating({ scoreValue, levelPrecise }) {
    return calculateChunithmChartRating(scoreValue, levelPrecise);
  },
  selectRankings: selectChunithmRankings,
};
