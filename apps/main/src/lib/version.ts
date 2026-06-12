/**
 * Build the rolling app version from build-time identity injected by
 * next.config.ts via `env`:
 *
 *   - APP_VERSION_MINOR — the "dev of next" minor derived from the latest
 *     changelog post (e.g. published `2026.5` -> dev `2026.6`).
 *   - BUILD_STAMP — HEAD commit time (MMDDHHMM).
 *   - GIT_SHA — short commit SHA.
 *
 * All three are frozen at build time, so this is a pure read with no runtime
 * file I/O — important because SiteFooter (in RootLayout) renders it on every
 * server request. The minor computation lives in next.config.ts.
 */
export function getAppVersion() {
  const minor = process.env.APP_VERSION_MINOR || "0.0";
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
