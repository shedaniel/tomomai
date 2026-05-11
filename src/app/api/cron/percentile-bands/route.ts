import { rebuildChartPercentileBands } from "@/server/queries/percentile";
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

  const result = await rebuildChartPercentileBands();
  return NextResponse.json({ rowsInserted: result.rowsInserted });
}
