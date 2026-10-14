import { requireFrontendGame } from "@/lib/games/current";
import { rebuildChartPercentileBands } from "@/server/services/games/maimai/percentile/queries";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every game's deployment registers the cron, and only maimai's refreshes the shared view.
export async function GET(req: NextRequest) {
  requireFrontendGame("maimai");
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
