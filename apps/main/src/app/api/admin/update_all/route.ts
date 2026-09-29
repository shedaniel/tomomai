import { getDefaultAdminCatalogRegions, resolveAdminGame } from "@/server/services/catalog/admin-game";
import { getSupportedRegions } from "@/lib/games/regions";
import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { gameErrorResponse } from "@/lib/api/game-context";
import { getCurrentVersion } from "@/lib/games/versions";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { Region } from "@/lib/types";
import { catalogRequiresToken } from "@/server/services/catalog/ingestion/source-auth";
import { NextRequest, NextResponse } from "next/server";
import type { Logger } from "pino";

async function updateRegion(
  game: CanonicalGameId,
  origin: string,
  region: Region,
  sourceToken: string | null,
  adminToken: string,
  imageUpload: boolean,
  log: Logger,
): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  const version = getCurrentVersion(game, region);

  // Step 1: Fetch records from /api/admin/update
  log.info({ region, version }, `Fetching ${region.toUpperCase()} records from /api/admin/update...`);
  const updateUrl = new URL(`${origin}/api/admin/update`);
  updateUrl.searchParams.set('game', game);
  updateUrl.searchParams.set('region', region);
  if (catalogRequiresToken(game, region) && sourceToken) {
    updateUrl.searchParams.set('token', sourceToken);
  }

  const updateResponse = await fetch(updateUrl.toString(), {
    method: "GET",
    headers: { "Authorization": `Bearer ${adminToken}` },
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    log.error({ region, status: updateResponse.status, statusText: updateResponse.statusText }, `Failed to fetch ${region.toUpperCase()} records`);
    return { success: false, error: `Failed to fetch ${region.toUpperCase()} records: ${errorText}`, status: updateResponse.status };
  }

  const updateData = await updateResponse.json();
  if (!updateData.success || !updateData.records) {
    log.error({ region }, `${region.toUpperCase()} update response did not contain records`);
    return { success: false, error: `${region.toUpperCase()} update response did not contain records`, status: 500 };
  }

  log.info({ region, recordCount: updateData.records.length }, `Fetched ${updateData.records.length} ${region.toUpperCase()} records`);

  // Step 2: Process cover images via /api/admin/image
  let songsForUpload = updateData.records;
  if (imageUpload) {
    log.info({ region }, `Processing ${region.toUpperCase()} cover images via /api/admin/image...`);
    const imageUrl = new URL(`${origin}/api/admin/image`);
    imageUrl.searchParams.set("game", game);

    const imageResponse = await fetch(imageUrl.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ songs: songsForUpload }),
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      log.error({ region, status: imageResponse.status, statusText: imageResponse.statusText }, `Failed to process ${region.toUpperCase()} cover images`);
      return { success: false, error: `Failed to process ${region.toUpperCase()} cover images: ${errorText}`, status: imageResponse.status };
    }

    const imageData = await imageResponse.json();
    songsForUpload = imageData.songs;
    log.info({ region, stats: imageData.stats }, `${region.toUpperCase()} cover images processed`);
  }

  // Step 3: Upload to /api/admin/upload with update=alter
  log.info({ region }, `Uploading ${region.toUpperCase()} records to /api/admin/upload...`);
  const uploadUrl = new URL(`${origin}/api/admin/upload`);
  uploadUrl.searchParams.set('game', game);
  uploadUrl.searchParams.set('region', region);
  uploadUrl.searchParams.set('version', String(version));
  uploadUrl.searchParams.set('update', 'alter');

  const uploadResponse = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ songs: songsForUpload }),
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    log.error({ region, status: uploadResponse.status, statusText: uploadResponse.statusText }, `Failed to upload ${region.toUpperCase()} records`);
    return { success: false, error: `Failed to upload ${region.toUpperCase()} records: ${errorText}`, status: uploadResponse.status };
  }

  const uploadData = await uploadResponse.json();
  log.info({ region, statistics: uploadData.statistics }, `${region.toUpperCase()} upload completed`);
  return { success: true, data: uploadData };
}

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/update_all");
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
    const game = resolveAdminGame(searchParams);
    const sourceToken = searchParams.get('token');

    const regionParam = searchParams.get('region') as Region | null;
    if (regionParam && !getSupportedRegions(game).includes(regionParam)) {
      return NextResponse.json(
        { error: `Invalid 'region' query parameter, must be one of: ${getSupportedRegions(game).join(", ")}` },
        { status: 400 }
      );
    }

    const imageUploadParam = searchParams.get('image_upload');
    const imageUpload = imageUploadParam !== "false";

    const origin = request.nextUrl.origin;
    const regions: Region[] = regionParam ? [regionParam] : getDefaultAdminCatalogRegions(game);

    if (regions.some(r => catalogRequiresToken(game, r)) && !sourceToken) {
      return NextResponse.json(
        { error: "Missing 'token' query parameter (required by catalog source)" },
        { status: 400 }
      );
    }
    log.info({ regions, imageUpload }, `Admin update_all requested: processing ${regions.map(r => r.toUpperCase()).join(" then ")} (image_upload=${imageUpload})`);

    const results: Record<string, any> = {};
    for (const r of regions) {
      const result = await updateRegion(game, origin, r, sourceToken, token, imageUpload, log);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      results[r] = result.data;
    }

    return NextResponse.json({
      success: true,
      requestId,
      message: `${regions.map(r => r.toUpperCase()).join(" and ")} updated successfully`,
      ...results,
    });

  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Error in admin update_all route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    // Serverless: ship buffered logs before the function is frozen/terminated.
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
