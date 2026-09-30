import "server-only";
import { decodeChunithmPlaylog } from "@/lib/games/chunithm/recent-details";
import { parseDisplayLevel } from "@/server/services/catalog/ingestion/levels";
import { chunithmImagePolicy } from "./catalog/images";
import type { GameServerModule } from "../types";

export const chunithmServerModule: GameServerModule<"chunithm"> = {
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
  async recentDetails(plays) {
    return plays.map(play => ({ game: "chunithm", playlog: decodeChunithmPlaylog(play.metadata) }));
  },
};
