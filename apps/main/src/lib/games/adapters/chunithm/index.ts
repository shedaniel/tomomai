import { GAME_SUPPORTED_REGIONS } from "../../regions";
import { GAME_CODE_MAPS } from "../../codes";
import { calculateChunithmChartRating, selectChunithmRankings } from "../../rating";
import type { GameAdapter } from "../../types";
import { chunithmVersionProvider } from "./versions";

export const chunithmAdapter: GameAdapter = {
  game: "chunithm",
  capabilities: new Set(["catalog", "rankings", "rating"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.chunithm,
  versions: chunithmVersionProvider,
  codes: GAME_CODE_MAPS.chunithm,
  calculateChartRating({ scoreValue, levelPrecise }) {
    return calculateChunithmChartRating(scoreValue, levelPrecise);
  },
  selectRankings: selectChunithmRankings,
};
