import { resolveAdminGame } from "@/lib/api/admin-game";
import { GameAdapterError } from "@/lib/games/types";
import { gameErrorResponse } from "@/lib/api/game-context";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { cacheCatalogImages } from "@/server/services/catalog/image-cache";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/cache_images");
  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const game = resolveAdminGame(searchParams);
    const batchSizeParam = searchParams.get('batch_size');
    const batchSize = batchSizeParam ? parseInt(batchSizeParam, 10) : 20; // Default batch size of 20

    if (isNaN(batchSize) || batchSize < 1 || batchSize > 100) {
      return NextResponse.json(
        { error: "Invalid batch_size parameter. Must be between 1 and 100" },
        { status: 400 }
      );
    }

    const result = await cacheCatalogImages(game, batchSize, log);
    return NextResponse.json({ ...result, requestId });

  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Error in admin cache_images route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    await flushLogger();
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
