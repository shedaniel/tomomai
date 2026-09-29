import { CANONICAL_GAME_IDS } from "./games/ids";
import { getGame } from "./games/registry";

const PROXIED_IMAGE_HOSTS: ReadonlySet<string> = new Set(
  CANONICAL_GAME_IDS.flatMap(game => getGame(game).presentation.imageProxyHosts),
);

export function isProxiedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      PROXIED_IMAGE_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

// R2 assets are pre-optimized WebP, so Next.js image optimization is skipped for them.
export function isR2Url(url: string): boolean {
  const r2Base = process.env.NEXT_PUBLIC_R2_URL;
  const r2BaseCN = process.env.NEXT_PUBLIC_R2_URL_CN;
  return (!!r2Base && url.startsWith(r2Base)) || (!!r2BaseCN && url.startsWith(r2BaseCN));
}

// Middleware sets the `country` cookie from x-vercel-ip-country.
function getCountryFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)country=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Visitors in China load R2 assets from the CN CDN so the fetch does not cross the GFW.
function rewriteR2ForCN(url: string): string {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  const cnBase = process.env.NEXT_PUBLIC_R2_URL_CN;
  if (!base || !cnBase || !url.startsWith(base)) return url;
  if (getCountryFromCookie() !== "CN") return url;
  return cnBase + url.slice(base.length);
}

export function resolveImageUrl(url: string): string {
  if (isProxiedImageUrl(url)) return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  return rewriteR2ForCN(url);
}
