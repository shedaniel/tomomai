import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

/** What each procedure delivers to the client, after the superjson transformer. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type RecentPlay = RouterOutputs["user"]["getRecentSongs"]["recentPlays"][number];
export type UserAlbum = RouterOutputs["user"]["getUserAlbums"]["albums"][number];
