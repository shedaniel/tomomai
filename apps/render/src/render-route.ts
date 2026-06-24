import { Canvas } from 'skia-canvas';
import type { Logger } from 'pino';

import { ImageCache } from './lib/render-image';
import { fontsLoaded, loadCachedImage } from './lib/render-image-server';
import { getRatingImageUrl } from './lib/rating-calculator';
import { getLogoUrl, getTypeBadgeUrl } from './lib/utils';
import { logger } from './lib/logger';
import { enterProfile, formatProfileTree, span } from './lib/profiler';
import type { Region } from './lib/types';

type SnapshotForResources = {
  rating: number;
  gameVersion: number;
  iconUrl: string;
  classRankUrl: string;
  courseRankUrl: string;
};

/**
 * Resource URLs every snapshot-based renderer needs: type badges, rating image,
 * the user's icon/class/course rank, trophies, the version character and logo,
 * default bg, and the full badge set. Renderers add their own extras on top.
 */
export function commonSnapshotResources(snapshot: SnapshotForResources, region: Region): string[] {
  const v = snapshot.gameVersion;
  return [
    getTypeBadgeUrl("dx"),
    getTypeBadgeUrl("std"),
    getRatingImageUrl(snapshot.rating, v),
    snapshot.iconUrl,
    snapshot.classRankUrl,
    snapshot.courseRankUrl,
    `/res/trophy/normal.png`,
    `/res/trophy/bronze.png`,
    `/res/trophy/silver.png`,
    `/res/trophy/gold.png`,
    `/res/trophy/rainbow.png`,
    `/res/character/${v}.png`,
    getLogoUrl(v, region),
    `/res/bg/${v}.png`,
    `/res/badge/${v}/none.png`,
    `/res/badge/${v}/sync.png`,
    `/res/badge/${v}/fc.png`,
    `/res/badge/${v}/fc+.png`,
    `/res/badge/${v}/fs.png`,
    `/res/badge/${v}/fs+.png`,
    `/res/badge/${v}/fdx.png`,
    `/res/badge/${v}/fdx+.png`,
  ];
}

function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
}

async function buildImageCache(
  urls: string[],
  log: Logger,
): Promise<{ cache: ImageCache; failed: { url: string; error: unknown }[] }> {
  const cache: ImageCache = {};
  const failed: { url: string; error: unknown }[] = [];
  await Promise.all(
    urls.map(async (url) => {
      if (url.startsWith('data:')) return;
      try {
        const image = await loadCachedImage(url);
        cache[url] = async () => image;
      } catch (error) {
        failed.push({ url, error });
        log.warn({ url, err: error }, `Failed to cache image: ${url}`);
      }
    }),
  );
  return { cache, failed };
}

export interface RenderJob {
  routeName: string;
  requestId: string;
  scale: 1 | 2;
  profile?: boolean;
  /** URLs to pre-fetch into the ImageCache before render. */
  resources: string[];
  /** Render the image using the pre-filled cache. */
  render: (cache: ImageCache) => Promise<Canvas>;
  /** Content-Disposition filename (no extension). */
  filename: string;
}

export type RenderOutcome =
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Core "skia-canvas → webp buffer" pipeline. Fonts → image-cache fill → render
 * → webp encode. Data comes from the decoded token (verified upstream); no DB.
 *
 * Returns a structured outcome so callers choose delivery: `/img` HTTP response
 * or Discord followup upload.
 */
export async function renderToWebp(job: RenderJob): Promise<RenderOutcome> {
  const { routeName, requestId } = job;
  const log = logger.child({ route: routeName, requestId });
  log.info(`Starting ${routeName} render`);

  const run = async (): Promise<RenderOutcome> => {
    try {
      await span("fontsLoaded", () => fontsLoaded.then(() => undefined));

      let startTime = Date.now();
      const { cache, failed } = await span("buildImageCache", () => buildImageCache(job.resources, log));
      if (failed.length > 0) {
        log.error({ count: failed.length }, `${failed.length} image(s) failed to load`);
        return {
          ok: false,
          status: 502,
          body: {
            error: 'Failed to fetch one or more images',
            failed: failed.map(({ url, error }) => ({
              url,
              message: error instanceof Error ? error.message : String(error),
            })),
            requestId,
          },
        };
      }
      log.info({ count: Object.keys(cache).length, durationMs: Date.now() - startTime }, `Cached ${Object.keys(cache).length} images`);

      startTime = Date.now();
      const canvas = await span("render", () => job.render(cache));
      log.info({ durationMs: Date.now() - startTime, profile: job.profile }, `Image rendered`);

      startTime = Date.now();
      const encoded = await span("encodeWebp", () => canvas.toBuffer('webp', { density: job.scale, quality: 0.85 }));
      log.info({ size: encoded.length, durationMs: Date.now() - startTime }, `Encoded webp (${encoded.length} bytes)`);

      return { ok: true, buffer: Buffer.from(encoded), filename: job.filename };
    } catch (error) {
      log.error({ err: error }, 'Failed to generate image');
      return {
        ok: false,
        status: 500,
        body: { error: 'Failed to generate image', details: error instanceof Error ? error.message : 'Unknown error', requestId },
      };
    }
  };

  if (!job.profile) {
    return await run();
  }

  const { result, root } = await enterProfile(routeName, run);
  // eslint-disable-next-line no-console
  console.log(`\n=== Request profile [${routeName} ${requestId}] ===\n${formatProfileTree(root)}\n`);
  return result;
}

/** `/img` delivery: turn a render outcome into the webp HTTP Response (or JSON error). */
export function outcomeToResponse(outcome: RenderOutcome, requestId: string): Response {
  if (!outcome.ok) {
    return jsonResponse(outcome.body, outcome.status, requestId);
  }
  return new Response(new Uint8Array(outcome.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Disposition': `attachment; filename="${outcome.filename}.webp"`,
      'Content-Length': outcome.buffer.length.toString(),
      'X-Request-Id': requestId,
    },
  });
}
