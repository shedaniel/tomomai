import { logger } from "@/lib/logger";
import { withRequestLogContext } from "@/lib/request-logger";
import { publishSongCatalog } from "@/server/services/admin/song-catalog";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withRequestLogContext("admin/catalog/publish", async (request: NextRequest, { requestId }) => {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token", requestId }, { status: 401 });
    }
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      logger.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json({ error: "Server configuration error", requestId }, { status: 500 });
    }
    if (token !== adminToken) {
      logger.warn("Invalid admin token attempt");
      return NextResponse.json({ error: "Invalid authorization token", requestId }, { status: 403 });
    }

    const publication = await publishSongCatalog();
    revalidateTag("all-unique-songs", { expire: 0 });
    revalidateTag("reserved-songs", { expire: 0 });
    revalidateTag("api-v1-songs", { expire: 0 });
    logger.info({ songCount: publication.songCount, size: publication.bytes }, "Published public song catalog to R2");
    return NextResponse.json({ success: true, requestId, ...publication });
  } catch (err) {
    logger.error({ err }, "Failed to publish public song catalog");
    return NextResponse.json({ error: "Failed to publish public song catalog", requestId }, { status: 500 });
  }
});
