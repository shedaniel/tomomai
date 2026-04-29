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
