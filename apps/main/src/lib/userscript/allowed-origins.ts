import { siteOrigin } from "@/lib/games/sites";

// Origins where the tomomai userscript may run. The token exchange CORS
// allowlist and the OAuth callback's postMessage target both read this list,
// and keeping them in sync is load-bearing for security (a wildcard
// targetOrigin leaks the code).
export const USERSCRIPT_ALLOWED_ORIGINS: readonly string[] = (["jp", "intl"] as const).map(region => siteOrigin("maimai", region));
