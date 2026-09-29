import "server-only";
import { normalizeName } from "@/lib/name-utils";
import { parseToken, TOKEN_PROVIDERS } from "@/lib/games/token-format";
import { FetchStartError } from "../fetch-errors";
import type { GameServerModule } from "../types";
import { maimaiLevelPolicy } from "./catalog/chart";
import { maimaiImagePolicy } from "./catalog/images";
import { parseLegacyCatalogRecord } from "./catalog/legacy-upload";

export const maimaiServerModule: GameServerModule = {
  catalog: {
    async stages(region) {
      const { maimaiCatalogStages } = await import("./catalog/pipeline");
      return maimaiCatalogStages(region);
    },
    levelPolicy: maimaiLevelPolicy,
    images: maimaiImagePolicy,
    normalizeTitle: normalizeName,
    async authenticate(region, token) {
      const { loginAndGetCookies } = await import("./login");
      return loginAndGetCookies(region, token);
    },
    parseLegacyRecord: parseLegacyCatalogRecord,
  },
  scores: {
    rejectStoredToken(token) {
      const parsed = parseToken(token);
      return parsed.provider !== null && TOKEN_PROVIDERS[parsed.provider].singleUse
        ? new FetchStartError("CN_COOKIES_SINGLE_USE", "This session token is single-use and has already been consumed. Please re-authenticate via the HTTP Proxy flow.")
        : null;
    },
    async fetch(context, run) {
      const { fetchMaimaiScores } = await import("./scores/score-source");
      return fetchMaimaiScores(context, run);
    },
  },
  reserved: {
    async user(username) {
      const { getReservedPublicUser } = await import("./reserved");
      return getReservedPublicUser(username);
    },
    async snapshot(username, region) {
      const { getReservedGameSnapshot } = await import("./reserved");
      return getReservedGameSnapshot(username, region);
    },
  },
};
