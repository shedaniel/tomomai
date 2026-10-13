import { tomomaiProfileUrl } from "./accounts/config";
import type { PlayerRow } from "./db/schema";
import type { Streak } from "./leaderboard";

/** Client-safe view of the signed-in player. */
export type Viewer = {
  /** tomomai username, or a stable generated handle for accounts without one. */
  name: string;
  image: string | null;
  showOnLeaderboard: boolean;
  profileUrl: string | null;
  streak: Streak;
};

/** The tomomai username, or a stable handle that doesn't reveal the player id. */
export function displayName(username: string | null, playerId: string): string {
  if (username) return username;
  let h = 0;
  for (const c of playerId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `player_${(h >>> 0).toString(36).slice(0, 5)}`;
}

export function toViewer(player: PlayerRow, streak: Streak | null): Viewer {
  return {
    name: displayName(player.username, player.id),
    image: player.image,
    showOnLeaderboard: player.showOnLeaderboard,
    profileUrl: player.username ? tomomaiProfileUrl(player.username) : null,
    streak: streak ?? { current: 0, solvedToday: false },
  };
}
