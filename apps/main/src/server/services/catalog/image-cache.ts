import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema-pg";
import { cacheImage } from "@/lib/image_cacher";

// Helper function to check if URL is a data URL
function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

// Helper function to process images in batches
async function cacheBatch(urls: string[], batchNumber: number, totalBatches: number, log: Logger): Promise<{ url: string; error?: string }[]> {
  log.debug(`Processing batch ${batchNumber}/${totalBatches} with ${urls.length} images...`);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await cacheImage(url);
        return { url };
      } catch (error) {
        log.warn({ err: error, url }, "Failed to cache image");
        return {
          url,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        url: urls[index],
        error: result.reason instanceof Error ? result.reason.message : "Promise rejected"
      };
    }
  });
}

export async function cacheCatalogImages(game: CanonicalGameId, batchSize: number, log: Logger) {
    log.info(`Admin cache_images requested with batch size: ${batchSize}`);

    // Step 1: Get all distinct cover URLs from songs table
    const distinctCovers = await db
      .select({ cover: parentSong.cover })
      .from(parentSong)
      .where(eq(parentSong.game, game))
      .groupBy(parentSong.cover);

    // Step 2: Filter out data URLs and empty/null URLs
    const httpUrls = distinctCovers
      .map(row => row.cover)
      .filter(url => !isDataUrl(url))
      .filter(url => url && url.trim() !== '');

    log.info(`Found ${distinctCovers.length} distinct covers, ${httpUrls.length} HTTP URLs to cache`);

    if (httpUrls.length === 0) {
      return ({
        success: true,
        message: "No HTTP URLs found to cache",
        statistics: {
          totalUrls: distinctCovers.length,
          httpUrls: 0,
          dataUrls: distinctCovers.length,
          cached: 0,
          errors: 0,
          batchSize,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Step 3: Process URLs in parallel batches
    const batches: string[][] = [];
    for (let i = 0; i < httpUrls.length; i += batchSize) {
      batches.push(httpUrls.slice(i, i + batchSize));
    }

    const allResults: { url: string; error?: string }[] = [];
    let totalCached = 0;
    let totalErrors = 0;

    // Process batches sequentially (but each batch processes URLs in parallel)
    for (let i = 0; i < batches.length; i++) {
      const batchResult = await cacheBatch(batches[i], i + 1, batches.length, log);
      allResults.push(...batchResult);
      totalCached += batchResult.filter(r => !r.error).length;
      totalErrors += batchResult.filter(r => r.error).length;
    }

    log.info({ cachedCount: totalCached, errorCount: totalErrors }, `Image caching completed: ${totalCached} cached, ${totalErrors} errors`);

    const errorUrls = allResults.filter(r => r.error).map(r => ({ url: r.url, error: r.error }));

    return ({
      success: true,
      message: "Image caching completed",
      statistics: {
        totalUrls: distinctCovers.length,
        httpUrls: httpUrls.length,
        dataUrls: distinctCovers.length - httpUrls.length,
        cached: totalCached,
        errors: totalErrors,
        batchSize,
        batches: batches.length,
        timestamp: new Date().toISOString(),
      },
      ...(totalErrors > 0 && {
        errorSample: errorUrls.slice(0, 5) // Include first 5 errors in response
      })
    });

}
