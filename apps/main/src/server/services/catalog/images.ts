import type { Logger } from "pino";
import type { CanonicalGameId } from "@/lib/games/types";
import { convertToWebp, fetchImageBuffer } from "@/lib/image-converter";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { value, type Pending } from "./ingestion/types";

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

export async function processCatalogImages<T extends { cover?: Pending<string> }>(game: CanonicalGameId, songs: T[], log: Logger) {
    const policy = GAME_SERVER_MODULES[game].catalog.images;
    log.info({ songCount: songs.length }, "Image processing starting");

    const filenameToUrl = new Map<string, string>();
    for (const song of songs) {
      const cover = value(song.cover);
      if (!cover) continue;
      const filename = policy.extractFilename(cover);
      if (!filename) continue;
      const existing = filenameToUrl.get(filename);
      if (!existing || policy.preferUrl(cover, existing)) {
        filenameToUrl.set(filename, cover);
      }
    }

    log.info({ uniqueCovers: filenameToUrl.size }, "Unique catalog cover URLs found");

    if (filenameToUrl.size === 0 && policy.staticAssets.length === 0) {
      return { songs, stats: { uploaded: 0, skipped: 0, unchanged: songs.length } };
    }

    const { listCoverKeys, uploadCoverToR2 } = await import("@/lib/r2");

    // Get existing covers in R2
    const existingKeys = await listCoverKeys();
    log.info({ existingR2Covers: existingKeys.size }, "Existing covers in R2");

    const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;
    // Build filename -> public URL map
    const filenameToPublicUrl = new Map<string, string>();

    let uploaded = 0;
    let skipped = 0;

    // Determine which filenames need downloading vs already exist
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

    // Download, convert, upload in batches of 10
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

    // Replace cover URLs in songs
    let unchanged = 0;
    const updatedSongs = songs.map((song) => {
      const cover = value(song.cover);
      const filename = cover ? policy.extractFilename(cover) : null;
      if (!filename) {
        unchanged++;
        return song;
      }
      const publicUrl = filenameToPublicUrl.get(filename);
      if (!publicUrl) {
        unchanged++;
        return song;
      }
      return { ...song, cover: publicUrl };
    });

    const stats = { uploaded, skipped, unchanged };
    log.info({ stats }, "Image processing complete");

    return { songs: updatedSongs, stats };
}
