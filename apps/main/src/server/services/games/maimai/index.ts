import "server-only";
import { parseToken, TOKEN_PROVIDERS } from "@/lib/games/token-format";
import { FetchStartError } from "../fetch-errors";
import type { GameServerModule } from "../types";

export const maimaiServerModule: GameServerModule = {
  catalog: {
    requiresToken: region => region !== "cn",
    async authenticate(region, token) {
      const { loginAndGetCookies } = await import("./login");
      return loginAndGetCookies(region, token);
    },
    async collect(context) {
      const { collectMaimaiCatalog } = await import("./catalog/pipeline");
      return collectMaimaiCatalog(context);
    },
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
