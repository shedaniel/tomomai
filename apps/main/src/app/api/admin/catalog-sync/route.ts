import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { syncCatalog } from "@/server/services/catalog-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/catalog-sync");
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) return NextResponse.json({ error: "Missing authorization token", requestId }, { status: 401 });
    const token = process.env.ADMIN_UPDATE_TOKEN;
    if (!token) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json({ error: "Server configuration error", requestId }, { status: 500 });
    }
    if (authorization !== `Bearer ${token}`) return NextResponse.json({ error: "Invalid authorization token", requestId }, { status: 403 });
    const force = request.nextUrl.searchParams.get("force") === "true";
    const result = await syncCatalog({ force });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (err) {
    log.error({ err }, "Catalog sync failed");
    return NextResponse.json({ error: "Catalog sync failed", requestId }, { status: 500 });
  } finally {
    await flushLogger();
  }
}
