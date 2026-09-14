export function resolveTomomaiApiBase(): string {
  return (process.env.TOMOMAI_API_BASE ?? "https://tomomai.lol").replace(/\/+$/, "");
}

export function requireOAuthClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.TOMOMAI_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TOMOMAI_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("TOMOMAI_OAUTH_CLIENT_ID and TOMOMAI_OAUTH_CLIENT_SECRET must be set");
  }

  return { clientId, clientSecret };
}

export function requireSessionSecret(): string {
  const secret = process.env.TAKEOUT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TAKEOUT_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}
