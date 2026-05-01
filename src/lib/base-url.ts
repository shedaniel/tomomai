export function resolveBaseUrl(): string {
  const normalize = (url: string) => url.replace(/\/+$/, "");
  const withProtocol = (url: string) => (url.startsWith("http") ? url : `https://${url}`);

  if (typeof window !== "undefined") {
    return normalize(window.location.origin);
  }

  // Explicit override — set this for environments that live behind a custom
  // domain alias Vercel doesn't expose via env (e.g. preview.tomomai.lol on
  // the `preview` branch). Use NEXT_PUBLIC_ so it's also available client-side
  // during SSR if ever needed.
  const override = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (override) {
    return normalize(withProtocol(override));
  }

  // On production deployments, prefer the stable production domain over the
  // per-deployment VERCEL_URL.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalize(withProtocol(process.env.VERCEL_PROJECT_PRODUCTION_URL));
  }

  // Branch alias (e.g. project-git-branch-team.vercel.app) — stable per branch
  // and a better default than the per-deployment URL when no custom override
  // is configured.
  if (process.env.VERCEL_BRANCH_URL) {
    return normalize(withProtocol(process.env.VERCEL_BRANCH_URL));
  }

  if (process.env.VERCEL_URL) {
    return normalize(withProtocol(process.env.VERCEL_URL));
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalize(withProtocol(process.env.VERCEL_PROJECT_PRODUCTION_URL));
  }

  return normalize("http://localhost:3000");
}

/**
 * Like resolveBaseUrl(), but prefers the request's actual host (via
 * `x-forwarded-host` / `host` headers) when available.
 *
 * Use this in server components / route handlers where we have the request
 * headers — it makes canonical URLs and OAuth redirect URIs follow the
 * hostname the user came in on. Required for the cn.tomomai.lol HK proxy
 * (see cn/README.md): users hitting cn.tomomai.lol shouldn't get redirected
 * to tomomai.lol mid-flow, otherwise they'd briefly leave the CN-fast path
 * and hit Cloudflare.
 *
 * Falls back to resolveBaseUrl() (env-based) when no headers are passed
 * or when the headers don't carry a usable host (e.g. background jobs,
 * sitemap generation outside a request context).
 */
export function resolveBaseUrlFromHeaders(h: Headers | undefined | null): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }
  if (!h) return resolveBaseUrl();

  // x-forwarded-host wins when set by a trusted proxy (Caddy in cn/, or
  // Vercel's edge for production traffic). Fall back to host for local dev.
  const xfHost = h.get("x-forwarded-host");
  const host = h.get("host");
  const chosen = (xfHost ?? host ?? "").split(",")[0].trim();

  // Whitelist-shaped sanity check — host headers are user-controlled and
  // we don't want to render attacker-supplied hostnames into canonical URLs
  // or OAuth redirect URIs. Only accept ASCII DNS-shaped values.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(chosen)) return resolveBaseUrl();

  const xfProto = h.get("x-forwarded-proto");
  const proto =
    (xfProto ?? "").split(",")[0].trim() ||
    (chosen.startsWith("localhost") || chosen.startsWith("127.") ? "http" : "https");

  return `${proto}://${chosen}`.replace(/\/+$/, "");
}
