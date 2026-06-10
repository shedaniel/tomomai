import { syncCatalog } from "@/server/services/catalog-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  if (!cronSecret) {
    if (!isDev) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncCatalog();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Catalog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalog sync failed" },
      { status: 500 }
    );
  }
}
