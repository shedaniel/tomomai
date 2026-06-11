import { NextRequest, NextResponse } from 'next/server';
import { Canvas } from 'skia-canvas';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';

import { ImageCache } from '@/lib/render-image';
import { fontsLoaded, loadCachedImage } from '@/lib/render-image-server';
import { getRatingImageUrl } from '@/lib/rating-calculator';
import { getLogoUrl, getTypeBadgeUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { enterProfile, formatProfileTree, span } from '@/lib/profiler';
import type { Region } from '@/lib/types';
import type { VersionId } from "@tomomai/catalog/metadata";

type SnapshotForResources = {
  rating: number;
  gameVersion: VersionId;
  iconUrl: string;
  classRankUrl: string;
  courseRankUrl: string;
};

/**
 * Resource URLs that every snapshot-based renderer needs: type badges, rating
 * image, the user's icon/class/course rank, trophies, the version character and
 * logo, default bg, and the full badge set. Renderers add their own extras on
 * top.
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

export type PrepareResult<D> =
  | { type: "ok"; data: D }
  | { type: "error"; status: number; message: string };

interface RenderRouteOptions<D, P> {
  request: NextRequest;
  routeName: string;
  /**
   * Zod schema applied to the URL search params (as a flat string-keyed object).
   * Parse failures short-circuit with a 400 + the schema's `flatten()` output.
   * The renderer-specific `scale` param is handled by the helper itself and
   * does not need to be in this schema.
   */
  searchParams: ZodType<P>;
  /**
   * Validate the request and load whatever the renderer needs. Returning an
   * error short-circuits the pipeline with a JSON response at the given status.
   */
  prepareData: (params: P, log: Logger) => Promise<PrepareResult<D>>;
  /** URLs to pre-fetch into the ImageCache before render. */
  resources: (data: D) => string[];
  render: (data: D, cache: ImageCache) => Promise<Canvas>;
  /** Content-Disposition filename (no extension). */
  filename: (data: D) => string;
}

function parseScale(request: NextRequest): 1 | 2 {
  return request.nextUrl.searchParams.get('scale') === '1' ? 1 : 2;
}

async function buildImageCache(urls: string[], log: Logger): Promise<{ cache: ImageCache; failed: { url: string; error: unknown }[] }> {
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
        log.warn({ url, err: error instanceof Error ? error.message : error }, `Failed to cache image: ${url}`);
      }
    })
  );
  return { cache, failed };
}

/**
 * Runs the standard "skia-canvas → webp Response" pipeline shared by every
 * image-rendering API route: requestId/logger, fontsLoaded, prepareData, image
 * cache fill, render, webp encode, and headers. Renderers only have to supply
 * prepareData / resources / render / filename.
 */
export async function renderWebpResponse<D, P>(opts: RenderRouteOptions<D, P>): Promise<Response> {
  const requestId = nanoid(10);
  const log = logger.child({ route: opts.routeName, requestId });

  log.info(`Starting ${opts.routeName} image request`);

  const profileEnabled = process.env.NODE_ENV === 'development'
    && opts.request.nextUrl.searchParams.get('profile') === '1';

  const run = async (): Promise<Response> => {
    try {
      await span("fontsLoaded", () => fontsLoaded.then(() => undefined));

      const scale = parseScale(opts.request);

      const rawParams = Object.fromEntries(opts.request.nextUrl.searchParams.entries());
      const parsed = opts.searchParams.safeParse(rawParams);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', issues: parsed.error.flatten().fieldErrors, requestId },
          { status: 400 },
        );
      }

      const prepared = await span("prepareData", () => opts.prepareData(parsed.data, log));
      if (prepared.type === "error") {
        return NextResponse.json({ error: prepared.message, requestId }, { status: prepared.status });
      }
      const { data } = prepared;

      let startTime = Date.now();
      const { cache, failed } = await span("buildImageCache", () => buildImageCache(opts.resources(data), log));
      if (failed.length > 0) {
        log.error({ count: failed.length }, `${failed.length} image(s) failed to load`);
        return NextResponse.json(
          {
            error: 'Failed to fetch one or more images',
            failed: failed.map(({ url, error }) => ({
              url,
              message: error instanceof Error ? error.message : String(error),
            })),
            requestId,
          },
          { status: 502 }
        );
      }
      log.info({ count: Object.keys(cache).length, durationMs: Date.now() - startTime }, `Cached ${Object.keys(cache).length} images`);

      startTime = Date.now();
      const canvas = await span("render", () => opts.render(data, cache));
      log.info({ durationMs: Date.now() - startTime, profile: profileEnabled }, `Image rendered`);

      startTime = Date.now();
      const buffer = await span("encodeWebp", () => canvas.toBuffer('webp', { density: scale, quality: 0.85 }));
      log.info({ size: buffer.length, durationMs: Date.now() - startTime }, `Encoded webp (${buffer.length} bytes)`);

      const filename = opts.filename(data);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Content-Disposition': `attachment; filename="${filename}.webp"`,
          'Content-Length': buffer.length.toString(),
          'X-Request-Id': requestId,
        },
      });
    } catch (error) {
      log.error({ err: error instanceof Error ? { message: error.message, stack: error.stack } : error }, 'Failed to generate image');
      return NextResponse.json(
        {
          error: 'Failed to generate image',
          details: error instanceof Error ? error.message : 'Unknown error',
          requestId,
        },
        { status: 500 }
      );
    }
  };

  if (!profileEnabled) {
    return await run();
  }

  const { result, root } = await enterProfile(opts.routeName, run);
  // eslint-disable-next-line no-console
  console.log(`\n=== Request profile [${opts.routeName} ${requestId}] ===\n${formatProfileTree(root)}\n`);
  return result;
}
