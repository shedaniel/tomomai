import { getCurrentVersion } from "@/lib/metadata";
import { Region } from "@/lib/types";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { NextRequest, NextResponse } from "next/server";

async function updateRegion(
  origin: string,
  region: Region,
  maimaiToken: string | null,
  adminToken: string,
  imageUpload: boolean,
): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  const version = getCurrentVersion(region);

  // Step 1: Fetch records from /api/admin/update
  console.log(`Fetching ${region.toUpperCase()} records from /api/admin/update...`);
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
    console.error(`Failed to fetch ${region.toUpperCase()} records: ${updateResponse.status} ${updateResponse.statusText}`);
    return { success: false, error: `Failed to fetch ${region.toUpperCase()} records: ${errorText}`, status: updateResponse.status };
  }

  const updateData = await updateResponse.json();
  if (!updateData.success || !updateData.records) {
    console.error(`${region.toUpperCase()} update response did not contain records`);
    return { success: false, error: `${region.toUpperCase()} update response did not contain records`, status: 500 };
  }

  console.log(`Fetched ${updateData.records.length} ${region.toUpperCase()} records`);

  // Step 2: Process cover images via /api/admin/image
  let songsForUpload = updateData.records;
  if (imageUpload) {
    console.log(`Processing ${region.toUpperCase()} cover images via /api/admin/image...`);
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
      console.error(`Failed to process ${region.toUpperCase()} cover images: ${imageResponse.status} ${imageResponse.statusText}`);
      return { success: false, error: `Failed to process ${region.toUpperCase()} cover images: ${errorText}`, status: imageResponse.status };
    }

    const imageData = await imageResponse.json();
    songsForUpload = imageData.songs;
    console.log(`${region.toUpperCase()} cover images processed:`, imageData.stats);
  }

  // Step 3: Upload to /api/admin/upload with update=alter
  console.log(`Uploading ${region.toUpperCase()} records to /api/admin/upload...`);
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
    console.error(`Failed to upload ${region.toUpperCase()} records: ${uploadResponse.status} ${uploadResponse.statusText}`);
    return { success: false, error: `Failed to upload ${region.toUpperCase()} records: ${errorText}`, status: uploadResponse.status };
  }

  const uploadData = await uploadResponse.json();
  console.log(`${region.toUpperCase()} upload completed:`, uploadData.statistics);
  return { success: true, data: uploadData };
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
    console.log(`Admin update_all requested: processing ${regions.map(r => r.toUpperCase()).join(" then ")} (image_upload=${imageUpload})`);

    const results: Record<string, any> = {};
    for (const r of regions) {
      const result = await updateRegion(origin, r, maimaiToken, token, imageUpload);
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
    console.error("Error in admin update_all route:", error);
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
