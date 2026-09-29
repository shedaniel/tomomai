import "server-only";
import { cache } from "react";
import { resolveGameContext } from "@/lib/games/access";
import { toPublicGameSnapshot } from "@/lib/games/public-player";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { resolvePublicUserByUsername } from "./public-access";
import { fetchLatestSnapshotData } from "./snapshots";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";

export const fetchPublicGameProfile = cache(async (game: CanonicalGameId, username: string, region: Region) => {
  resolveGameContext(game, { region, capability: "scores" });
  const profile = await resolvePublicUserByUsername(username, game);
  const data = await GAME_SERVER_MODULES[game].reserved?.snapshot(username, region)
    ?? await fetchLatestSnapshotData(game, profile.id, region);
  return {
    profile,
    snapshotData: data ? toPublicGameSnapshot(game, data, profile) : null,
  };
});
