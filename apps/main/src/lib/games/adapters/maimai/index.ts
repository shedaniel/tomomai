import { GAME_SUPPORTED_REGIONS } from "../../regions";
import { GAME_CODE_MAPS } from "../../codes";
import { calculateMaimaiChartRating, selectMaimaiRankings } from "../../rating";
import type { GameAdapter } from "../../types";
import { maimaiVersionProvider } from "./versions";

export const maimaiAdapter: GameAdapter = {
  game: "maimai",
  capabilities: new Set(["catalog", "scores", "recents", "albums", "events", "rankings", "rating", "plates", "score-details", "profile-icon"]),
  supportedRegions: GAME_SUPPORTED_REGIONS.maimai,
  versions: maimaiVersionProvider,
  codes: GAME_CODE_MAPS.maimai,
  catalog: {
    configured: true,
    requiresToken: region => region !== "cn",
    async authenticate(region, token) {
      const { loginAndGetCookies } = await import("@/server/services/maimai-login");
      return loginAndGetCookies(region, token);
    },
    async collect(context) {
      const { collectCatalog } = await import("@/server/services/catalog/maimai/pipeline");
      return collectCatalog(context);
    },
  },
  scores: {
    configured: true,
    async validateToken(context) {
      const { maimaiScoreAdapter } = await import("./score");
      return maimaiScoreAdapter.validateToken?.(context);
    },
    async fetch(context) {
      const { maimaiScoreAdapter } = await import("./score");
      return maimaiScoreAdapter.fetch(context);
    },
  },
  calculateChartRating({ scoreValue, levelPrecise, difficulty, comboStatus = 0 }, version) {
    return calculateMaimaiChartRating(scoreValue, levelPrecise, difficulty, comboStatus, version);
  },
  selectRankings: selectMaimaiRankings,
};
