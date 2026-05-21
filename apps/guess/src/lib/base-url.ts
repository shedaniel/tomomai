/**
 * Resolve the canonical base URL for this deployment. Mirrors the helper in
 * `apps/main/src/lib/base-url.ts` so robots / sitemap / metadata all agree.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — explicit override for the deployment.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — set on Vercel prod builds.
 *   3. Hardcoded production URL.
 */
export function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://guesser.tomomai.lol";
}
