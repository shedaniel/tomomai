import "server-only";
import type { GameServerModule } from "../types";

export const maimaiServerModule: GameServerModule = {
  catalog: {
    configured: true,
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
    configured: true,
    validateToken(context) {
      if (context.token.startsWith("cn-cookies://") && !context.tokenProvided) {
        throw new Error("CN_COOKIES_SINGLE_USE: This session token is single-use and has already been consumed. Please re-authenticate via the HTTP Proxy flow.");
      }
    },
    async fetch(context) {
      const [{ runMaimaiFetcher, persistMaimaiExtra }, { normalizeFetchedMaimaiData }] = await Promise.all([
        import("./scores/orchestrator"),
        import("./scores/normalize"),
      ]);
      const { fetched } = await runMaimaiFetcher(context);
      return {
        result: await normalizeFetchedMaimaiData(fetched, { region: context.region, version: context.gameVersion }),
        persistExtra: (persisted, backgroundWorkRef) =>
          persistMaimaiExtra(persisted, fetched, context.shouldFetchAlbums, backgroundWorkRef),
      };
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
