import { z } from "zod";
import type { CanonicalGameId } from "@/lib/games/ids";
import { chunithmApiDetails, chunithmRecentDetails, chunithmSnapshotDetails, chunithmSongDetails } from "./chunithm";
import { snapshotCore, snapshotEvent, songCatalogueEntry, songScore, recentPlayCore, type GameApiDetails } from "./common";
import { maimaiApiDetails, maimaiRecentDetails, maimaiSnapshotDetails, maimaiSongDetails } from "./maimai";

export * from "./common";

const DETAILS_DESCRIPTION = "The fields only this game has. `game` names the shape.";

export const songDetail = songCatalogueEntry.extend({
  details: z.discriminatedUnion("game", [maimaiSongDetails, chunithmSongDetails]).describe(DETAILS_DESCRIPTION),
});

export const snapshotMetadata = snapshotCore.extend({
  details: z.discriminatedUnion("game", [maimaiSnapshotDetails, chunithmSnapshotDetails]).describe(DETAILS_DESCRIPTION),
});

export const snapshotDetail = snapshotMetadata.extend({
  iconUrl: z
    .string()
    .nullable()
    .describe("Profile icon URL. Requires `snapshot:*:icon:read`, otherwise null."),
  songs: z
    .array(songScore)
    .nullable()
    .describe("Song scores. Null if neither `…songs:read` nor `…songs:b50:read` is granted."),
  events: z
    .array(snapshotEvent)
    .nullable()
    .describe("Event progress. Null if `…events:read` is not granted."),
});

export const recentPlay = recentPlayCore.extend({
  details: z.discriminatedUnion("game", [maimaiRecentDetails, chunithmRecentDetails]).describe(DETAILS_DESCRIPTION),
});

export const GAME_API_DETAILS = {
  maimai: maimaiApiDetails,
  chunithm: chunithmApiDetails,
} satisfies { [G in CanonicalGameId]: GameApiDetails<G> };
