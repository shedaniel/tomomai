import { runCronRegionUpdate } from "@/server/services/admin/cron-update";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  return runCronRegionUpdate(req, "jp");
}
