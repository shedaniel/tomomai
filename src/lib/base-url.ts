export function resolveBaseUrl(): string {
  const normalize = (url: string) => url.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    return normalize(window.location.origin);
  }

  if (process.env.VERCEL_URL) {
    const vercelUrl = process.env.VERCEL_URL;
    const full = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return normalize(full);
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const full = productionUrl.startsWith("http") ? productionUrl : `https://${productionUrl}`;
    return normalize(full);
  }

  return normalize("http://localhost:3000");
}
