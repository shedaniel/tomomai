import { syncCatalog } from "@/server/services/catalog-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_UPDATE_TOKEN;
  if (!adminToken) {
    console.error("ADMIN_UPDATE_TOKEN environment variable not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${adminToken}`) {
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
