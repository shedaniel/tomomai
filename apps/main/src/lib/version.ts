import { getAllPostsMeta } from "@/lib/posts";

/**
 * The version we are *currently developing* ("dev of next").
 *
 * Changelog posts are recaps of the just-finished cycle, so once the `2026.5`
 * post is published we are already working toward `2026.6`. The current dev
 * minor is therefore the latest post's minor + 1, with a year rollover in
 * December (minors track months, so they top out at 12).
 *
 *   nextDevVersion("2026.5")  -> "2026.6"
 *   nextDevVersion("2026.12") -> "2027.1"
 */
export function nextDevVersion(latest: string): string {
  const [year, minor] = latest.split(".").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(minor)) return latest;
  return minor >= 12 ? `${year + 1}.1` : `${year}.${minor + 1}`;
}

/**
 * Build the rolling app version from the latest changelog post (the editorial
 * source of truth for the minor) plus the build-time stamp and short SHA
 * injected by next.config.ts. The post version is identical across locales, so
 * we always read English.
 */
export function getAppVersion() {
  const latest = getAllPostsMeta("en").find(
    (p) => p.version && p.version !== "N/A",
  )?.version;
  const minor = latest ? nextDevVersion(latest) : "0.0";
  const stamp = process.env.BUILD_STAMP || "dev";
  const sha = process.env.GIT_SHA || "dev";

  return {
    minor,
    stamp,
    sha,
    full: `${minor}.${stamp}`,
    display: `v${minor}.${stamp} · commit ${sha}`,
  };
}
