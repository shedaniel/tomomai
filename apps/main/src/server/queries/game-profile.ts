import "server-only";
import { cache } from "react";
import { resolveGameContext } from "@/lib/games/access";
import { toPublicGameSnapshot, toPublicSnapshotHeader } from "@/lib/games/public-player";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { latestSnapshot } from "./latest-snapshot";
import { resolvePublicUserByUsername } from "./public-access";
import { fetchLatestSnapshotData, gameSnapshotColumns } from "./snapshots";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";

async function resolvePublicProfile(game: CanonicalGameId, username: string, region: Region, viewerId?: string) {
  resolveGameContext(game, { region, capability: "scores" });
  return resolvePublicUserByUsername(game, username, viewerId);
}

/** The profile a visitor may open, with its latest snapshot in the region. A signed-in friend passes their id. */
export const fetchPublicGameProfile = cache(async (game: CanonicalGameId, username: string, region: Region, viewerId?: string) => {
  const profile = await resolvePublicProfile(game, username, region, viewerId);
  const data = await GAME_SERVER_MODULES[game].reserved?.snapshot(username, region)
    ?? await fetchLatestSnapshotData(game, profile.id, region);
  return {
    profile,
    snapshotData: data ? toPublicGameSnapshot(game, data, profile) : null,
  };
});

/** The published profile and only the header of its latest snapshot, for views that show no scores. Never reached through friends, since crawlers read it. */
export const fetchPublicGameProfileHeader = cache(async (game: CanonicalGameId, username: string, region: Region) => {
  const profile = await resolvePublicProfile(game, username, region);
  const reserved = await GAME_SERVER_MODULES[game].reserved?.snapshot(username, region);
  const snapshot = reserved?.snapshot ?? await latestSnapshot(game, profile.id, region, gameSnapshotColumns);
  return {
    profile,
    snapshot: snapshot ? toPublicSnapshotHeader(snapshot, profile) : null,
  };
});
