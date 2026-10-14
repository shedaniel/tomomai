import "server-only";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { GameServerModule } from "./types";
import { maimaiServerModule } from "./maimai";
import { chunithmServerModule } from "./chunithm";

export const GAME_SERVER_MODULES = {
  maimai: maimaiServerModule,
  chunithm: chunithmServerModule,
} satisfies { [G in CanonicalGameId]: GameServerModule<G> };
