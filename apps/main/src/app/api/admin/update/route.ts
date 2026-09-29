import { resolveAdminGame } from "@/server/services/catalog/admin-game";
import { getSupportedRegions } from "@/lib/games/regions";
import { GameAdapterError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId } from "@/lib/games/types";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { Region } from "@/lib/types";
import { getCurrentVersion } from "@/lib/games/versions";
import { awaitWrapper, sortKeys } from "@/lib/utils";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { authenticateCatalogSource, collectCatalog } from "@/server/services/catalog/ingestion/collect";
import { formatCatalogError } from "@/server/services/catalog/errors";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/update");

  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') as Region | null;
  let game: CanonicalGameId | undefined;

  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token", requestId },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error", requestId },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token", requestId },
        { status: 403 }
      );
    }

    game = resolveAdminGame(searchParams);

    // Get query parameters
    const sourceToken = searchParams.get('token');

    if (!region || !getSupportedRegions(game).includes(region)) {
      return NextResponse.json(
        { error: `Missing or invalid 'region' query parameter. Must be one of: ${getSupportedRegions(game).join(", ")}`, requestId },
        { status: 400 }
      );
    }

    const [cookies, authError] = await awaitWrapper(authenticateCatalogSource(game, region, sourceToken));
    if (authError) {
      log.error({ err: authError, game, region }, "Catalog source authentication failed");
      return NextResponse.json({ error: authError.message, requestId }, { status: 400 });
    }
    log.info({ game, region }, "Admin catalog collection requested");

    const songs = await collectCatalog(game, {
      region,
      version: getCurrentVersion(game, region),
      session: { cookies: cookies ?? "" },
      log,
    });
    const newRecords = songs.map(record => sortKeys(record));

    log.info({ count: newRecords.length }, "Update completed successfully");

    return NextResponse.json({
      success: true,
      requestId,
      message: "Song data update completed",
      records: newRecords,
    });
  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Critical error in admin update route");
    if (game && region) sendDiscordNotice(
      game,
      region,
      "Fetch pipeline error",
      `**Request:** ${requestId}\n**Error:** ${error instanceof Error ? formatCatalogError(error) : String(error)}`,
      0xFF0000,
    ).catch(() => { });
    return NextResponse.json({
      error: "Internal Error",
      requestId
    }, { status: 500 });
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
