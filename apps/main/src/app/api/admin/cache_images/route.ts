import { db } from "@/lib/db";
import { cacheImage } from "@/lib/image_cacher";
import { songs } from "@/lib/db/schema-pg";
import { NextRequest, NextResponse } from "next/server";

// Helper function to check if URL is a data URL
function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

// Helper function to process images in batches
async function processBatch(urls: string[], batchNumber: number, totalBatches: number): Promise<{ url: string; error?: string }[]> {
  console.log(`Processing batch ${batchNumber}/${totalBatches} with ${urls.length} images...`);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await cacheImage(url);
        return { url };
      } catch (error) {
        console.error(`Failed to cache image ${url}:`, error);
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
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
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

    console.log(`Admin cache_images requested with batch size: ${batchSize}`);

    // Step 1: Get all distinct cover URLs from songs table
    console.log("Step 1: Fetching all distinct cover URLs from songs table...");

    const distinctCovers = await db
      .select({ cover: songs.cover })
      .from(songs)
      .groupBy(songs.cover);

    console.log(`Found ${distinctCovers.length} distinct cover URLs`);

    // Step 2: Filter out data URLs
    console.log("Step 2: Filtering out data URLs...");

    const httpUrls = distinctCovers
      .map(row => row.cover)
      .filter(url => !isDataUrl(url))
      .filter(url => url && url.trim() !== ''); // Also filter out empty/null URLs

    console.log(`Filtered to ${httpUrls.length} HTTP URLs (removed ${distinctCovers.length - httpUrls.length} data/invalid URLs)`);

    if (httpUrls.length === 0) {
      return NextResponse.json({
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
    console.log(`Step 3: Processing ${httpUrls.length} URLs in batches of ${batchSize}...`);

    const batches: string[][] = [];
    for (let i = 0; i < httpUrls.length; i += batchSize) {
      batches.push(httpUrls.slice(i, i + batchSize));
    }

    console.log(`Created ${batches.length} batches for processing`);

    const allResults: { url: string; error?: string }[] = [];
    let totalCached = 0;
    let totalErrors = 0;

    // Process batches sequentially (but each batch processes URLs in parallel)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResult = await processBatch(batch, i + 1, batches.length);

      allResults.push(...batchResult);

      const batchCached = batchResult.filter(r => !r.error).length;
      const batchErrors = batchResult.filter(r => r.error).length;

      totalCached += batchCached;
      totalErrors += batchErrors;

      console.log(`Batch ${i + 1}/${batches.length} completed: ${batchCached} cached, ${batchErrors} errors`);
    }

    console.log(`Image caching completed: ${totalCached} cached successfully, ${totalErrors} errors`);

    // Step 4: Log summary of results
    const errorUrls = allResults.filter(r => r.error).map(r => ({ url: r.url, error: r.error }));
    if (errorUrls.length > 0) {
      console.log("URLs that failed to cache:", errorUrls.slice(0, 10)); // Log first 10 errors
      if (errorUrls.length > 10) {
        console.log(`... and ${errorUrls.length - 10} more errors`);
      }
    }

    return NextResponse.json({
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

  } catch (error) {
    console.error("Error in admin cache_images route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
