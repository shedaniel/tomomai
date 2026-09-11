import { publishCatalog } from "@/server/catalog/publish";
import { requestLogger } from "@/lib/request-logger";
import { flushLogger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/publish");
  try {
    const token = process.env.ADMIN_UPDATE_TOKEN;
    if (!token) return NextResponse.json({ error: "Admin token is not configured", requestId }, { status: 500 });
    if (request.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
    const manifest = await publishCatalog();
    log.info({ count: manifest.sequence }, "Published catalog release");
    return NextResponse.json({ success: true, manifest, requestId });
  } catch (err) {
    log.error({ err }, "Catalog publication failed");
    return NextResponse.json({ error: "Catalog publication failed", requestId }, { status: 500 });
  } finally { await flushLogger(); }
}
