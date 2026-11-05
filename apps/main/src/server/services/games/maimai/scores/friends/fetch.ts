import "server-only";
import type { Region } from "@/lib/games/ids";
import type { PlayerFriendData } from "@/server/services/friends/sync";
import type { GameSiteClient } from "@/server/services/games/sega/http";

/**
 * The signed-in player's friend code and in-game friend list, or null when the site does not show them.
 * Not implemented yet: it needs maimai DX NET's friend code and friend list pages.
 */
export async function fetchFriendData(_site: GameSiteClient, _region: Region): Promise<PlayerFriendData | null> {
  return null;
}
