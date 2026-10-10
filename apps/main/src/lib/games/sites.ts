import type { CanonicalGameId, Region } from "./ids";
import { GameError } from "./errors";
import { getGame, type GameSiteRegion } from "./registry";
import type { GameSite } from "./types";

const AIME_GATEWAY_ORIGIN = "https://lng-tgk-aime-gw.am-all.net";

export const SEGA_AIME_GATEWAY = {
  origin: AIME_GATEWAY_ORIGIN,
  landingUrl: `${AIME_GATEWAY_ORIGIN}/common_auth/`,
  submitUrl: `${AIME_GATEWAY_ORIGIN}/common_auth/login/sid`,
  /** The gateway login page that returns to the site's mobile root. */
  loginUrl(game: CanonicalGameId, region: Region): string {
    const { aime } = gameSite(game, region);
    if (!aime) throw new Error(`${getGame(game).brand.displayName} ${region} does not sign in through the SEGA Aime gateway`);
    const url = new URL("/common_auth/login", AIME_GATEWAY_ORIGIN);
    url.search = new URLSearchParams({ site_id: aime.siteId, redirect_url: siteRoot(game, region).href, back_url: aime.backUrl }).toString();
    return url.href;
  },
} as const;

export function getGameSite(game: CanonicalGameId, region: Region): GameSite | undefined {
  return getGame(game).sites[region];
}

/** The game's site in the region, refusing a region the game has no site for. */
export function gameSite(game: CanonicalGameId, region: Region): GameSite {
  const site = getGameSite(game, region);
  if (!site) throw new GameError("UNSUPPORTED_REGION", `${getGame(game).brand.displayName} has no ${region} site`, game, region);
  return site;
}

export function requireGameSite<G extends CanonicalGameId>(game: G, region: Region): asserts region is GameSiteRegion<G> {
  gameSite(game, region);
}

export function siteOrigin(game: CanonicalGameId, region: Region): string {
  return gameSite(game, region).origin;
}

export function siteRoot(game: CanonicalGameId, region: Region): URL {
  const site = gameSite(game, region);
  return new URL(site.mobileRoot, site.origin);
}

/** Resolves a path against the site's mobile root, refusing anything that leaves the site's origin. */
export function siteUrl(game: CanonicalGameId, region: Region, relativePath = ""): URL {
  const root = siteRoot(game, region);
  const url = new URL(relativePath, root);
  if (url.origin !== root.origin) throw new Error(`Unexpected game site origin for ${game}/${region}`);
  return url;
}
