import { GAME_SUPPORTED_REGIONS } from "../../regions";
import { GAME_CODE_MAPS } from "../../codes";
import { calculateMaimaiChartRating, selectMaimaiRankings } from "../../rating";
import type { GameAdapter } from "../../types";
import { maimaiVersionProvider } from "../../versions";

export const maimaiAdapter: GameAdapter = {
  game: "maimai",
  capabilities: new Set(["catalog", "scores", "recents", "albums", "events", "rankings", "rating", "plates", "score-details", "profile-icon"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.maimai,
  versions: maimaiVersionProvider,
  codes: GAME_CODE_MAPS.maimai,
  catalog: {
    configured: true,
    resolveVersion: region => maimaiVersionProvider.getCurrentVersion(region),
    requiresToken: region => region !== "cn",
    async authenticate(region, token) {
      const { maimaiCatalogAdapter } = await import("@/server/services/catalog/maimai/pipeline");
      return maimaiCatalogAdapter.authenticate!(region, token);
    },
    async collect(context) {
      const { maimaiCatalogAdapter } = await import("@/server/services/catalog/maimai/pipeline");
      return maimaiCatalogAdapter.collect!(context);
    },
  },
  scores: { configured: true },
  calculateChartRating({ scoreValue, levelPrecise, difficulty, comboStatus = 0 }, version) {
    return calculateMaimaiChartRating(scoreValue, levelPrecise, difficulty, comboStatus, version);
  },
  selectRankings: selectMaimaiRankings,
};
