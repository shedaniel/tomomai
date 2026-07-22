import { getCachedEdgeConfig } from "@/lib/edge-config-cache";
import { NextResponse } from "next/server";
import { parsePreMaintenanceBanner } from "./parse";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "CDN-Cache-Control": "public, s-maxage=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300",
} as const;

export async function GET() {
  try {
    const value = await getCachedEdgeConfig<string>("preMaintenanceMode");
    return NextResponse.json(
      { banner: parsePreMaintenanceBanner(value) },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { banner: null },
      { status: 503, headers: CACHE_HEADERS },
    );
  }
}
