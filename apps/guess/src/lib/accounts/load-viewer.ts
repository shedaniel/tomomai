import type { PlayerRow } from "../db/schema";
import { getStreak } from "../leaderboard";
import { toViewer, type Viewer } from "../viewer";

export async function loadViewer(player: PlayerRow): Promise<Viewer> {
  return toViewer(player, await getStreak(player.id));
}
