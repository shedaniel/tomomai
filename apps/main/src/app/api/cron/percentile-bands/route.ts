import { rebuildChartPercentileBands } from "@/server/queries/percentile";
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

  const result = await rebuildChartPercentileBands();
  return NextResponse.json({ rowsInserted: result.rowsInserted });
}
