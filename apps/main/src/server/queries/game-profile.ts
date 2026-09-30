import "server-only";
import { cache } from "react";
import { resolveGameContext } from "@/lib/games/access";
import { toPublicGameSnapshot, toPublicSnapshotHeader } from "@/lib/games/public-player";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { latestSnapshot } from "./latest-snapshot";
import { resolvePublicUserByUsername } from "./public-access";
import { fetchLatestSnapshotData, gameSnapshotColumns } from "./snapshots";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";

async function resolvePublicProfile(game: CanonicalGameId, username: string, region: Region) {
  resolveGameContext(game, { region, capability: "scores" });
  return resolvePublicUserByUsername(game, username);
}

export const fetchPublicGameProfile = cache(async (game: CanonicalGameId, username: string, region: Region) => {
  const profile = await resolvePublicProfile(game, username, region);
  const data = await GAME_SERVER_MODULES[game].reserved?.snapshot(username, region)
    ?? await fetchLatestSnapshotData(game, profile.id, region);
  return {
    profile,
    snapshotData: data ? toPublicGameSnapshot(game, data, profile) : null,
  };
});

/** The published profile and only the header of its latest snapshot, for views that show no scores. */
export const fetchPublicGameProfileHeader = cache(async (game: CanonicalGameId, username: string, region: Region) => {
  const profile = await resolvePublicProfile(game, username, region);
  const reserved = await GAME_SERVER_MODULES[game].reserved?.snapshot(username, region);
  const snapshot = reserved?.snapshot ?? await latestSnapshot(game, profile.id, region, gameSnapshotColumns);
  return {
    profile,
    snapshot: snapshot ? toPublicSnapshotHeader(snapshot, profile) : null,
  };
});
