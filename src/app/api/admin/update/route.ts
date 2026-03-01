import { logger } from "@/lib/logger";
import { getCurrentVersion } from "@/lib/metadata";
import { awaitWrapper, sortKeys } from "@/lib/utils";
import { sendDiscordNotice } from "@/server/services/admin/discord-webhooks";
import { createNoticeSink } from "@/server/services/admin/fetcher-utils";
import { fetchLevels } from "@/server/services/admin/level-fetcher";
import { login } from "@/server/services/admin/maimai-login";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const log = logger.child({
    route: "admin/update",
    requestId,
  });

  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') as "intl" | "jp" | null;

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
    const maimaiToken = searchParams.get('token');

    if (!maimaiToken) {
      return NextResponse.json(
        { error: "Missing 'token' query parameter" },
        { status: 400 }
      );
    }

    if (!region || (region !== "intl" && region !== "jp")) {
      return NextResponse.json(
        { error: "Missing or invalid 'region' query parameter. Must be 'intl' or 'jp'" },
        { status: 400 }
      );
    }

    log.info({ region }, "Admin update requested: scraping maimai data");

    // Step 1: Validate the maimai token
    log.info("Validating maimai token...");
    const [cookies, cookiesError] = await awaitWrapper(login(region, maimaiToken));

    log.info("Token validated. Fetching levels...");

    if (cookiesError) {
      return NextResponse.json(
        { error: cookiesError.message },
        { status: 400 }
      );
    }

    const songs = await fetchLevels({
      region,
      version: getCurrentVersion(region),
      cookies: cookies!,
      log,
      notice: createNoticeSink(),
    });

    // Convert to json
    const newRecords = songs
      // sort keys
      .map(record => sortKeys(record))
      .sort((a, b) => a.songName.localeCompare(b.songName) * 1000000 + a.difficulty.localeCompare(b.difficulty) * 1000 + a.type.localeCompare(b.type));

    log.info({ count: newRecords.length }, "Update completed successfully");

    return NextResponse.json({
      success: true,
      message: "Song data update completed",
      records: newRecords,
    });
  } catch (error) {
    log.error(error, "Critical error in admin update route");
    sendDiscordNotice(
      region ?? "intl",
      "Fetch pipeline error",
      `**Error:** ${error instanceof Error ? error.message : String(error)}`,
      0xFF0000,
    ).catch(() => { });
    return NextResponse.json({
      error: "Internal Error",
      requestId
    }, { status: 500 });
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
