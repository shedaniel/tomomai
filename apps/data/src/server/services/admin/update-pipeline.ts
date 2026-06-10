import { getCurrentVersion } from "@/lib/metadata";
import { Region } from "@/lib/types";

// Orchestrates the full per-region ingestion pipeline by calling the sibling
// admin routes over HTTP (same mechanism apps/main's update_all used):
// /api/admin/update (fetch+merge sources) → /api/admin/image (cover caching,
// rewrites covers to R2 object keys) → /api/admin/upload (DB write).
// Shared by /api/admin/update_all and the per-region cron routes.

export type RegionPipelineResult = {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
};

export async function updateRegion(
  origin: string,
  region: Region,
  maimaiToken: string | null,
  adminToken: string,
  imageUpload: boolean,
): Promise<RegionPipelineResult> {
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
