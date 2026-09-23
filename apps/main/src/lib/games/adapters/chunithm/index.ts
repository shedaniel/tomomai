import { GAME_CODE_MAPS } from "../../codes";
import { calculateChunithmChartRating, selectChunithmRankings } from "../../rating";
import type { GameAdapter } from "../../types";
import { chunithmVersionProvider } from "../../versions";

export const chunithmAdapter: GameAdapter = {
  game: "chunithm",
  capabilities: new Set(["rankings", "rating"]),
  supportedRegions: new Set(["intl", "jp"]),
  versions: chunithmVersionProvider,
  codes: GAME_CODE_MAPS.chunithm,
  catalog: {
    configured: false,
    notConfiguredReason: "CHUNITHM catalog scraping is not implemented; no upstream site is configured.",
  },
  scores: {
    configured: false,
    notConfiguredReason: "CHUNITHM score fetching is not implemented; no upstream provider is configured.",
  },
  calculateChartRating({ scoreValue, levelPrecise }) {
    return calculateChunithmChartRating(scoreValue, levelPrecise);
  },
  selectRankings: selectChunithmRankings,
};
