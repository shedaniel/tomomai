import { REGION_ENUM } from "@tomomai/catalog/enums";
import { Region } from "@tomomai/catalog/types";
import { runCronRegionUpdate } from "@/server/services/admin/cron-update";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 800;

// Single cron entry point (invoked by an external scheduler, e.g. Cronicle):
//   GET /api/cron/update?region=jp
//   Authorization: Bearer $CRON_SECRET
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region");
  if (!region || !REGION_ENUM.includes(region as Region)) {
    return NextResponse.json(
      { error: `Missing or invalid 'region' query parameter. Must be one of: ${REGION_ENUM.join(", ")}` },
      { status: 400 },
    );
  }
  return runCronRegionUpdate(req, region as Region);
}
