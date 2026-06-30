import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { Region } from "@/lib/types";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { getCurrentVersion } from "@/lib/metadata";
import { awaitWrapper, sortKeys } from "@/lib/utils";
import { sendDiscordNotice } from "@/server/services/admin/discord-webhooks";
import { createNoticeSink } from "@/server/services/admin/fetcher-utils";
import { fetchLevels } from "@/server/services/admin/level-fetcher";
import { loginAndGetCookies } from "@/server/services/maimai-login";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/update");

  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') as Region | null;

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

    if (!region || !isRegionEnabled(region)) {
      return NextResponse.json(
        { error: `Missing or invalid 'region' query parameter. Must be one of: ${getEnabledRegions().join(", ")}` },
        { status: 400 }
      );
    }

    // CN uses the public Lxns API and does not need a maimai session cookie.
    let cookies = "";
    if (region !== "cn") {
      if (!maimaiToken) {
        return NextResponse.json(
          { error: "Missing 'token' query parameter" },
          { status: 400 }
        );
      }

      log.info({ region }, "Admin update requested: scraping maimai data");

      log.info("Validating maimai token...");
      const [resolved, cookiesError] = await awaitWrapper(loginAndGetCookies(region, maimaiToken));

      log.info("Token validated. Fetching levels...");

      if (cookiesError) {
        return NextResponse.json(
          { error: cookiesError.message },
          { status: 400 }
        );
      }
      cookies = resolved!;
    } else {
      log.info({ region }, "Admin update requested: fetching CN data from Lxns");
    }

    const songs = await fetchLevels({
      region,
      version: getCurrentVersion(region),
      cookies,
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
      requestId,
      message: "Song data update completed",
      records: newRecords,
    });
  } catch (error) {
    log.error({ err: error }, "Critical error in admin update route");
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
