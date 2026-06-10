import { db } from "@/lib/db";
import { cacheImage } from "@/lib/image_cacher";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { songs } from "@/lib/db/schema-pg";
import { NextRequest, NextResponse } from "next/server";
import type { Logger } from "pino";

// Helper function to check if URL is a data URL
function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

// Helper function to process images in batches
async function processBatch(urls: string[], batchNumber: number, totalBatches: number, log: Logger): Promise<{ url: string; error?: string }[]> {
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

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/cache_images");
  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const batchSizeParam = searchParams.get('batch_size');
    const batchSize = batchSizeParam ? parseInt(batchSizeParam, 10) : 20; // Default batch size of 20

    if (isNaN(batchSize) || batchSize < 1 || batchSize > 100) {
      return NextResponse.json(
        { error: "Invalid batch_size parameter. Must be between 1 and 100" },
        { status: 400 }
      );
    }

    log.info(`Admin cache_images requested with batch size: ${batchSize}`);

    // Step 1: Get all distinct cover URLs from songs table
    const distinctCovers = await db
      .select({ cover: songs.cover })
      .from(songs)
      .groupBy(songs.cover);

    // Step 2: Filter out data URLs and empty/null URLs
    const httpUrls = distinctCovers
      .map(row => row.cover)
      .filter(url => !isDataUrl(url))
      .filter(url => url && url.trim() !== '');

    log.info(`Found ${distinctCovers.length} distinct covers, ${httpUrls.length} HTTP URLs to cache`);

    if (httpUrls.length === 0) {
      return NextResponse.json({
        success: true,
        requestId,
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
      const batchResult = await processBatch(batches[i], i + 1, batches.length, log);
      allResults.push(...batchResult);
      totalCached += batchResult.filter(r => !r.error).length;
      totalErrors += batchResult.filter(r => r.error).length;
    }

    log.info({ cachedCount: totalCached, errorCount: totalErrors }, `Image caching completed: ${totalCached} cached, ${totalErrors} errors`);

    const errorUrls = allResults.filter(r => r.error).map(r => ({ url: r.url, error: r.error }));

    return NextResponse.json({
      success: true,
      requestId,
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

  } catch (error) {
    log.error({ err: error }, "Error in admin cache_images route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    await flushLogger();
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
