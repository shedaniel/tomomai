import { resolveAdminGame } from "@/lib/api/admin-game";
import { GameAdapterError } from "@/lib/games/types";
import { gameErrorResponse } from "@/lib/api/game-context";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import type { Pending } from "@/server/services/catalog/ingestion/types";
import { processCatalogImages } from "@/server/services/catalog/images";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/image");
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    const game = resolveAdminGame(request.nextUrl.searchParams);
    const body: { songs: { cover?: Pending<string> }[] } = await request.json();
    const songs = body.songs;

    if (!Array.isArray(songs)) {
      return NextResponse.json(
        { error: "Missing or invalid 'songs' array in request body" },
        { status: 400 }
      );
    }

    const result = await processCatalogImages(game, songs, log);
    return NextResponse.json({ ...result, requestId });
  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Error in admin image route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    await flushLogger();
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
