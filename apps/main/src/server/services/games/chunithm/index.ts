import "server-only";
import type { GameServerModule } from "../types";

export const chunithmServerModule: GameServerModule = {
  catalog: {
    configured: true,
    async collect(context) {
      const { collectChunithmCatalog } = await import("./catalog/pipeline");
      return collectChunithmCatalog(context);
    },
  },
  scores: {
    configured: true,
    async fetch(context) {
      const { fetchPlayer } = await import("./scores/pipeline");
      return { result: await fetchPlayer(context) };
    },
  },
};
