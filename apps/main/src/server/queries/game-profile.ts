import "server-only";
import { resolveGameContext } from "@/lib/games/registry";
import { toPublicGameSnapshot } from "@/lib/games/public-player";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { resolvePublicUserByUsername } from "./public-access";
import { fetchLatestSnapshotDataForGame } from "./snapshots";

export async function fetchPublicGameProfile(game: CanonicalGameId, username: string, region: Region) {
  resolveGameContext(game, region, "scores");
  const profile = await resolvePublicUserByUsername(username, game);
  const data = await fetchLatestSnapshotDataForGame(game, profile.id, region);
  return {
    profile,
    snapshotData: data ? toPublicGameSnapshot(game, data, profile) : null,
  };
}
