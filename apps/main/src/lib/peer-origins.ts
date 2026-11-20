/**
 * The other games' sites that share this database and its accounts, from the comma-separated
 * `PEER_ORIGINS`. Empty for a single deployment. Entries that are not URLs are skipped.
 */
export function peerOrigins(value: string | undefined = process.env.PEER_ORIGINS): string[] {
  const origins = (value ?? "").split(",").flatMap((entry) => {
    try {
      return [new URL(entry.trim()).origin];
    } catch {
      return [];
    }
  });
  return [...new Set(origins)];
}
