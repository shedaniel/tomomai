/** One player's side of a possible friendship: when their list was saved, and whether it names the other player. */
export type FriendListSide = { syncedAt: Date | null; names: boolean };

/**
 * In-game friendship is mutual, so either list is evidence. When both players have a list, the newer
 * one decides, so unfriending in game ends the match once either player syncs again.
 */
export function isFriendMatch(mine: FriendListSide, theirs: FriendListSide): boolean {
  if (mine.syncedAt && theirs.syncedAt) {
    const newer = mine.syncedAt.getTime() - theirs.syncedAt.getTime();
    if (newer === 0) return mine.names || theirs.names;
    return newer > 0 ? mine.names : theirs.names;
  }
  if (mine.syncedAt) return mine.names;
  if (theirs.syncedAt) return theirs.names;
  return false;
}
