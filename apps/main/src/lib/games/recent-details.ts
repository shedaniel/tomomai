import type { ChunithmRecentDetails } from "./chunithm/recent-details";
import type { CanonicalGameId } from "./ids";
import type { MaimaiRecentDetails } from "./maimai/recent-details";

type RecentDetailsByGame = {
  maimai: MaimaiRecentDetails;
  chunithm: ChunithmRecentDetails;
};

/**
 * What only one game records about a recent play, named by `game`.
 * `playlog` holds the play's detail page and is null until that page is fetched.
 */
export type RecentPlayDetails<G extends CanonicalGameId = CanonicalGameId> = {
  [K in G]: { game: K } & RecentDetailsByGame[K];
}[G];

export type FetchedRecentPlayDetails<G extends CanonicalGameId = CanonicalGameId> = {
  [K in G]: { game: K } & RecentDetailsByGame[K] & { playlog: NonNullable<RecentDetailsByGame[K]["playlog"]> };
}[G];

export function hasPlaylog<G extends CanonicalGameId>(details: RecentPlayDetails<G>): details is FetchedRecentPlayDetails<G> {
  return details.playlog !== null;
}
