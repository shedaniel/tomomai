import "server-only";
import { parseDisplayLevel } from "@/server/services/catalog/ingestion/levels";
import { chunithmImagePolicy } from "./catalog/images";
import type { GameServerModule } from "../types";

export const chunithmServerModule: GameServerModule = {
  catalog: {
    async stages() {
      const { OtogeDbFetcher } = await import("./catalog/sources/otoge-db");
      return [{ name: "OtogeDB", run: OtogeDbFetcher }];
    },
    levelPolicy: () => ({ toPrecise: level => parseDisplayLevel(level, 5) }),
    images: chunithmImagePolicy,
  },
  scores: {
    async fetch(context, run) {
      const { fetchChunithmScores } = await import("./scores/pipeline");
      return fetchChunithmScores(context, run);
    },
  },
};
