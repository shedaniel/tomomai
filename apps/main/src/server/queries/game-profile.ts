import "server-only";
import { cache } from "react";
import { resolveGameContext } from "@/lib/games/registry";
import { toPublicGameSnapshot } from "@/lib/games/public-player";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { resolvePublicUserByUsername } from "./public-access";
import { fetchLatestSnapshotData } from "./snapshots";
import { loadReservedMaimaiSnapshot } from "@/server/services/games/maimai/reserved-profile";
import type { GameSnapshotData } from "@/lib/games/player-view";

const RESERVED_SNAPSHOT_LOADERS: Partial<Record<CanonicalGameId, (username: string, region: Region) => Promise<GameSnapshotData | null>>> = {
  maimai: loadReservedMaimaiSnapshot,
};

export const fetchPublicGameProfile = cache(async (game: CanonicalGameId, username: string, region: Region) => {
  resolveGameContext(game, region, "scores");
  const profile = await resolvePublicUserByUsername(username, game);
  const data = await RESERVED_SNAPSHOT_LOADERS[game]?.(username, region)
    ?? await fetchLatestSnapshotData(game, profile.id, region);
  return {
    profile,
    snapshotData: data ? toPublicGameSnapshot(game, data, profile) : null,
  };
});
