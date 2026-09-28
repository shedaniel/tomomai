import { GAME_SUPPORTED_REGIONS } from "../../regions";
import { calculateChunithmChartRating, selectChunithmRankings } from "../../rating";
import type { GameAdapter } from "../../types";
import { chunithmVersionProvider } from "./versions";

export const chunithmAdapter: GameAdapter = {
  game: "chunithm",
  capabilities: new Set(["catalog", "scores", "recents", "rankings", "rating", "profile-icon"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.chunithm,
  versions: chunithmVersionProvider,
  calculateChartRating({ scoreValue, levelPrecise }) {
    return calculateChunithmChartRating(scoreValue, levelPrecise);
  },
  selectRankings: selectChunithmRankings,
};
