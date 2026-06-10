import { syncCatalog } from "@/server/services/catalog-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Manual catalog sync trigger:
//   curl -X POST "https://yourdomain.com/api/admin/catalog-sync" \
//     -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
// Pass ?force=true to reload even when the sequence is unchanged.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  const adminToken = process.env.ADMIN_UPDATE_TOKEN;
  if (!adminToken) {
    console.error("ADMIN_UPDATE_TOKEN environment variable not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (token !== adminToken) {
    console.warn("Invalid admin token attempt");
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 403 });
  }

  const force = new URL(request.url).searchParams.get("force") === "true";

  try {
    const result = await syncCatalog({ force });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Catalog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalog sync failed" },
      { status: 500 }
    );
  }
}
