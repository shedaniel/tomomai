import { getCurrentVersion } from "@/lib/metadata";
import { logger, flushLogger } from "@/lib/logger";
import { Region } from "@/lib/types";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import type { Logger } from "pino";

async function updateRegion(
  origin: string,
  region: Region,
  maimaiToken: string | null,
  adminToken: string,
  imageUpload: boolean,
  log: Logger,
): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  const version = getCurrentVersion(region);

  // Step 1: Fetch records from /api/admin/update
  log.info({ region, version }, `Fetching ${region.toUpperCase()} records from /api/admin/update...`);
  const updateUrl = new URL(`${origin}/api/admin/update`);
  updateUrl.searchParams.set('region', region);
  // CN uses Lxns (public) and the update route does not require a maimai token.
  if (region !== "cn" && maimaiToken) {
    updateUrl.searchParams.set('token', maimaiToken);
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

  log.info({ region, records: updateData.records.length }, `Fetched ${updateData.records.length} ${region.toUpperCase()} records`);

  // Step 2: Process cover images via /api/admin/image
  let songsForUpload = updateData.records;
  if (imageUpload) {
    log.info({ region }, `Processing ${region.toUpperCase()} cover images via /api/admin/image...`);
    const imageUrl = new URL(`${origin}/api/admin/image`);

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
  const requestId = nanoid(10);
  const log = logger.child({ route: "admin/update_all", requestId });
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
    const maimaiToken = searchParams.get('token');

    const regionParam = searchParams.get('region') as Region | null;
    if (regionParam && !isRegionEnabled(regionParam)) {
      return NextResponse.json(
        { error: `Invalid 'region' query parameter, must be one of: ${getEnabledRegions().join(", ")}` },
        { status: 400 }
      );
    }

    const imageUploadParam = searchParams.get('image_upload');
    const imageUpload = imageUploadParam !== "false";

    const origin = request.nextUrl.origin;
    const regions: Region[] = regionParam ? [regionParam] : getEnabledRegions();

    // maimaiToken is only required if any non-CN region is being processed.
    if (regions.some(r => r !== "cn") && !maimaiToken) {
      return NextResponse.json(
        { error: "Missing 'token' query parameter (required for jp/intl)" },
        { status: 400 }
      );
    }
    log.info({ regions, imageUpload }, `Admin update_all requested: processing ${regions.map(r => r.toUpperCase()).join(" then ")} (image_upload=${imageUpload})`);

    const results: Record<string, any> = {};
    for (const r of regions) {
      const result = await updateRegion(origin, r, maimaiToken, token, imageUpload, log);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      results[r] = result.data;
    }

    return NextResponse.json({
      success: true,
      message: `${regions.map(r => r.toUpperCase()).join(" and ")} updated successfully`,
      ...results,
    });

  } catch (error) {
    log.error({ err: error }, "Error in admin update_all route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
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
