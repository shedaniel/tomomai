import { resolveAdminGame } from "@/server/services/catalog/admin-game";
import { GameAdapterError } from "@/lib/games/types";
import { gameErrorResponse } from "@/lib/api/game-context";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/catalog/publish");
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token", requestId }, { status: 401 });
    }
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json({ error: "Server configuration error", requestId }, { status: 500 });
    }
    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json({ error: "Invalid authorization token", requestId }, { status: 403 });
    }

    const game = resolveAdminGame(request.nextUrl.searchParams);
    const publication = await publishSongCatalog(game);
    revalidateTag(`all-unique-songs:${game}`, { expire: 0 });
    revalidateTag(`reserved-songs:${game}`, { expire: 0 });
    revalidateTag(`api-v1-songs:${game}`, { expire: 0 });
    log.info({ game, songCount: publication.songCount, size: publication.bytes }, "Published public song catalog to R2");
    return NextResponse.json({ success: true, game, requestId, ...publication });
  } catch (err) {
    if (err instanceof GameAdapterError) return gameErrorResponse(err);
    log.error({ err }, "Failed to publish public song catalog");
    return NextResponse.json({ error: "Failed to publish public song catalog", requestId }, { status: 500 });
  } finally {
    await flushLogger();
  }
}
