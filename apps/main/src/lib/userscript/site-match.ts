import { CANONICAL_GAME_IDS } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";

export const SITE_MATCH_PLACEHOLDER = "__TOMOMAI_SITE_MATCH__";

/**
 * The pages the script announces itself on: the site serving it and every game's site, so a copy
 * installed from one site also tells the other site's token dialog it is installed. Match patterns
 * take no port, and one without a port matches every port.
 */
export function siteMatchPatterns(base: string): string[] {
  const { protocol, hostname } = new URL(base);
  const sites = CANONICAL_GAME_IDS.map((game) => `https://${getGame(game).brand.domain}/*`);
  return [...new Set([`${protocol}//${hostname}/*`, ...sites])];
}

/** Repeats the header's placeholder @match line once for each pattern. */
export function fillSiteMatches(script: string, patterns: readonly string[]): string {
  return script.replace(
    new RegExp(`^(// @match\\s+)${SITE_MATCH_PLACEHOLDER}$`, "m"),
    (_line, prefix: string) => patterns.map((pattern) => `${prefix}${pattern}`).join("\n"),
  );
}
