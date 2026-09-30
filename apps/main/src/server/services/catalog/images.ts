import type { Logger } from "pino";
import { formatChartLabel } from "@/lib/games/presentation";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/ids";
import { convertToWebp, fetchImageBuffer } from "@/lib/image-converter";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { AdminRequestError } from "./admin-game";
import type { CatalogChart } from "./ingestion/schema";

export type CatalogImageResult = {
  charts: CatalogChart[];
  stats: { uploaded: number; skipped: number; unchanged: number };
};

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/** Refuses to collect a catalog without hosting its covers when the site cannot load the source covers. */
export function assertCoverHostingEnabled(game: CanonicalGameId, hostImages: boolean): void {
  if (!hostImages && GAME_SERVER_MODULES[game].catalog.images.requireHosting) {
    throw new AdminRequestError(`${getGame(game).brand.displayName} covers must be hosted, so image_upload cannot be false`);
  }
}

/** Refuses charts that still point at a source cover, for a game whose covers the site cannot load from the source. */
export function assertCoversHosted(game: CanonicalGameId, charts: CatalogChart[]): void {
  const policy = GAME_SERVER_MODULES[game].catalog.images;
  if (!policy.requireHosting) return;
  const unhosted = charts.find(chart => policy.extractFilename(chart.cover) !== null);
  if (unhosted) throw new AdminRequestError(`Unhosted catalog cover: ${formatChartLabel(game, unhosted)}`);
}

/** Hosts each chart's cover on R2 under the game's cover rules and points the chart at the hosted copy. */
export async function processCatalogImages(game: CanonicalGameId, charts: CatalogChart[], log: Logger): Promise<CatalogImageResult> {
  const policy = GAME_SERVER_MODULES[game].catalog.images;
  log.info({ songCount: charts.length }, "Image processing starting");

  const filenameToUrl = new Map<string, string>();
  for (const { cover } of charts) {
    const filename = policy.extractFilename(cover);
    if (!filename) continue;
    const existing = filenameToUrl.get(filename);
    if (!existing || policy.preferUrl(cover, existing)) {
      filenameToUrl.set(filename, cover);
    }
  }

  log.info({ uniqueCovers: filenameToUrl.size }, "Unique catalog cover URLs found");

  if (filenameToUrl.size === 0 && policy.staticAssets.length === 0) {
    return { charts, stats: { uploaded: 0, skipped: 0, unchanged: charts.length } };
  }

  const { listCoverKeys, uploadCoverToR2 } = await import("@/lib/r2");

  const existingKeys = await listCoverKeys();
  log.info({ existingR2Covers: existingKeys.size }, "Existing covers in R2");

  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;
  const filenameToPublicUrl = new Map<string, string>();

  let uploaded = 0;
  let skipped = 0;

  type CoverTask = { filename: string; basename: string; url: string };
  const toDownload: CoverTask[] = [];

  for (const [filename, url] of filenameToUrl) {
    const basename = filename.replace(/\.[^.]+$/, "");
    const webpKey = `${basename}.webp`;

    if (existingKeys.has(webpKey)) {
      filenameToPublicUrl.set(filename, `${r2BaseUrl}/covers/${webpKey}`);
      skipped++;
    } else {
      toDownload.push({ filename, basename, url });
    }
  }

  log.info({ toDownload: toDownload.length, skipped }, "Cover download plan");

  await processBatch(toDownload, 10, async ({ filename, basename, url }) => {
    log.debug({ filename, url }, "Downloading cover");
    const buffer = await fetchImageBuffer(url);
    const webpBuffer = await convertToWebp(buffer);
    log.debug({ filename, originalSize: buffer.length, webpSize: webpBuffer.length }, "Converted to WebP");
    await uploadCoverToR2(webpBuffer, basename);
    filenameToPublicUrl.set(filename, `${r2BaseUrl}/covers/${basename}.webp`);
    uploaded++;
    log.debug({ filename, basename }, "Uploaded cover to R2");
  });

  for (const { url, basename } of policy.staticAssets) {
    const webpKey = `${basename}.webp`;
    if (!existingKeys.has(webpKey)) {
      log.info({ basename, url }, "Caching static asset to R2");
      const buffer = await fetchImageBuffer(url);
      const webpBuffer = await convertToWebp(buffer);
      await uploadCoverToR2(webpBuffer, basename);
      log.info({ basename }, "Static asset cached");
    }
  }

  let unchanged = 0;
  const hosted = charts.map((chart) => {
    const filename = policy.extractFilename(chart.cover);
    const publicUrl = filename && filenameToPublicUrl.get(filename);
    if (!publicUrl) {
      unchanged++;
      return chart;
    }
    return { ...chart, cover: publicUrl };
  });

  const stats = { uploaded, skipped, unchanged };
  log.info({ stats }, "Image processing complete");

  return { charts: hosted, stats };
}
