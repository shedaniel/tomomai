import { Region } from "@tomomai/catalog/types";
import { getEnabledRegions, isRegionEnabled } from "@tomomai/catalog/enabled-regions";
import { updateRegion } from "@/server/services/admin/update-pipeline";
import { publishCatalog } from "@/server/catalog/publish";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 800;

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

    // Publish the updated catalog artifact so consumers pick up the new data
    console.log("Publishing catalog artifact...");
    const manifest = await publishCatalog();
    console.log(`Catalog published: sequence ${manifest.sequence}`);

    return NextResponse.json({
      success: true,
      message: `${regions.map(r => r.toUpperCase()).join(" and ")} updated successfully`,
      manifest,
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
