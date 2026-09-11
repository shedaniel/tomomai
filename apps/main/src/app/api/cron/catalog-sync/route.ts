import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { syncCatalog } from "@/server/services/catalog-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "cron/catalog-sync");
  try {
    const token = process.env.CRON_SECRET;
    if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
      return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
    }
    const result = await syncCatalog();
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (err) {
    log.error({ err }, "Catalog sync failed");
    return NextResponse.json({ error: "Catalog sync failed", requestId }, { status: 500 });
  } finally {
    await flushLogger();
  }
}
