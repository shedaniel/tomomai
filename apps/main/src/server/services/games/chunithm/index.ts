import "server-only";
import type { GameServerModule } from "../types";

export const chunithmServerModule: GameServerModule = {
  catalog: {
    async collect(context) {
      const { collectChunithmCatalog } = await import("./catalog/pipeline");
      return collectChunithmCatalog(context);
    },
  },
  scores: {
    async fetch(context, run) {
      const { fetchChunithmScores } = await import("./scores/pipeline");
      return fetchChunithmScores(context, run);
    },
  },
};
