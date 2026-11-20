import { peerOrigins } from "@/lib/peer-origins";

export const SITE_MATCH_PLACEHOLDER = "__TOMOMAI_SITE_MATCH__";

/**
 * The pages the script announces itself on: the site serving it and the sites in `PEER_ORIGINS`, so a
 * copy installed from one site also tells the other site's token dialog it is installed. Match patterns
 * take no port, and one without a port matches every port.
 */
export function siteMatchPatterns(base: string, peers: readonly string[] = peerOrigins()): string[] {
  return [...new Set([base, ...peers].map((origin) => {
    const { protocol, hostname } = new URL(origin);
    return `${protocol}//${hostname}/*`;
  }))];
}

/** Repeats the header's placeholder @match line once for each pattern. */
export function fillSiteMatches(script: string, patterns: readonly string[]): string {
  return script.replace(
    new RegExp(`^(// @match\\s+)${SITE_MATCH_PLACEHOLDER}$`, "m"),
    (_line, prefix: string) => patterns.map((pattern) => `${prefix}${pattern}`).join("\n"),
  );
}
