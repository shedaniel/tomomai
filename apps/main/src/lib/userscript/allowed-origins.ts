// Origins where the tomomai userscript may run. Used both by the token
// exchange CORS allowlist and by the OAuth callback page when posting the
// authorization code back to the opener window — keeping the two in sync
// is load-bearing for security (wildcard targetOrigin leaks the code).
export const USERSCRIPT_ALLOWED_ORIGINS = [
  "https://maimaidx.jp",
  "https://maimaidx-eng.com",
] as const;

export type UserscriptAllowedOrigin = (typeof USERSCRIPT_ALLOWED_ORIGINS)[number];
