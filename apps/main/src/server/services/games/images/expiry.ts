const DEFAULT_TTL_SECONDS = 300;

/** The unix second after which apps/render refuses a token minted now. */
export function renderTokenExpiry(ttlSeconds = DEFAULT_TTL_SECONDS): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}
