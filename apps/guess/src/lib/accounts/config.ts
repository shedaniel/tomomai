const DEFAULT_TOMOMAI = "https://www.tomomai.lol";

/** tomomai origin hosting the OAuth provider; must equal its BETTER_AUTH_URL. */
export function tomomaiAuthBase(): string {
  const raw = process.env.TOMOMAI_AUTH_URL ?? process.env.TOMOMAI_API_URL ?? DEFAULT_TOMOMAI;
  return raw.replace(/\/$/, "");
}

export function oauthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.TOMOMAI_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TOMOMAI_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Sign-in needs both the OAuth client and a database to keep players in. */
export function accountsEnabled(): boolean {
  return Boolean(process.env.POSTGRES_URL) && oauthClient() !== null;
}

/** Built from the request origin; tomomai rejects any origin not registered on the app. */
export function oauthRedirectUri(origin: string): string {
  return `${origin}/api/auth/callback`;
}

export function tomomaiProfileUrl(username: string): string {
  return `${tomomaiAuthBase()}/profile/${encodeURIComponent(username)}`;
}
