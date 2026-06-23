import path from 'path';

/**
 * Root of the static image/font assets the renderer reads from disk (the
 * `/res/*` tree: backgrounds, badges, trophies, fonts, …).
 *
 * This app owns its own curated copy under `public/res` (only what skia reads),
 * so the default `process.cwd()/public` resolves in dev with no config. Set
 * `PUBLIC_DIR` only to override (Docker points it at /app/public).
 */
export const PUBLIC_DIR =
  process.env.PUBLIC_DIR ?? path.join(process.cwd(), 'public');
