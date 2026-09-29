import { resolveAdminGame } from "@/server/services/catalog/admin-game";
import { getSupportedRegions } from "@/lib/games/regions";
import { GameAdapterError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId } from "@/lib/games/types";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import type { Region } from "@/lib/types";
import { parseCatalogUpload } from "@/server/services/catalog/ingestion/parse-upload";
import { sendDiscordWebhook } from "@/server/services/catalog/notifications";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { parseCatalogVersion } from "@/lib/catalog/parse-version";
import { NextRequest, NextResponse } from "next/server";
import { persistCatalog } from "@/server/services/catalog/ingestion/persistence";
import { revalidateCatalog } from "@/server/services/catalog/revalidation";
import { parseCatalogUpdateMode } from "@/server/services/catalog/ingestion/persistence/analyze";
import { formatCatalogError } from "@/server/services/catalog/errors";

export async function POST(request: NextRequest) {
  const { log: baseLog, requestId } = requestLogger(request, "admin/upload");
  let log = baseLog;
  let noticeContext: { game: CanonicalGameId; region: Region } | undefined;
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

    const { searchParams } = new URL(request.url);
    const game = resolveAdminGame(searchParams, { write: true });
    const region = searchParams.get('region') as Region;
    const versionParam = searchParams.get('version');
    const updateMode = parseCatalogUpdateMode(searchParams.get('update'));

    if (!region || !getSupportedRegions(game).includes(region)) {
      return NextResponse.json(
        { error: `Missing or invalid 'region' query parameter. Must be one of: ${getSupportedRegions(game).join(", ")}` },
        { status: 400 }
      );
    }

    if (!versionParam) {
      return NextResponse.json(
        { error: "Missing 'version' query parameter" },
        { status: 400 }
      );
    }
    noticeContext = { game, region };

    let version: number;
    try {
      version = parseCatalogVersion(game, region, versionParam);
    } catch {
      return NextResponse.json(
        { error: "Invalid 'version' query parameter. Must be a supported catalog version for the region" },
        { status: 400 }
      );
    }

    const body = await request.json();
    let uploadSongs;
    try {
      uploadSongs = parseCatalogUpload(game, body.songs);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid catalog records", requestId }, { status: 400 });
    }

    log = log.child({ game, region, version });

    log.info({
      songCount: uploadSongs.length
    }, "Upload merge analysis starting");

    const { statistics, changes, applied, appliedDeletions, skippedDeletions, affected } = await persistCatalog(game, region, version, uploadSongs, updateMode, log);

    const appliedCount = applied.added + applied.modified + applied.deleted;
    if (updateMode !== "noop") {
      // Publish first: ISR invalidation must never advertise catalog changes
      // while the stable API object still contains the previous DB state.
      const publication = await publishSongCatalog(game);
      log.info({ count: publication.songCount }, "Published public song catalog to R2");
    }

    log.info({ updateMode, applied: { added: applied.added, modified: applied.modified, deleted: applied.deleted } }, "DB update complete");

    if (updateMode !== "noop") {
      // An upload that changed no chart is a republish, so it refreshes every page.
      await revalidateCatalog(game, { affected: appliedCount === 0 ? undefined : affected, log });
      sendDiscordWebhook(game, region, changes.added, appliedDeletions, changes.modified).catch(err => {
        log.error({ err }, "Failed to send Discord webhook");
      });
    }

    let summary = `**Mode:** ${updateMode}\n**Input:** ${statistics.inputSongs} | **DB:** ${statistics.dbSongs} | **Merged:** ${statistics.mergedSongs}\n**Applied:** +${applied.added} ~${applied.modified} -${applied.deleted}`;
    if (skippedDeletions.length > 0) {
      summary += `\n\n**${skippedDeletions.length} deletion(s) skipped** (have saved user references):\n`;
      summary += skippedDeletions.slice(0, 15).map(d => `- ${d.songKey} (${d.playRecordCount} references)`).join("\n");
      if (skippedDeletions.length > 15) summary += `\n... and ${skippedDeletions.length - 15} more`;
    }
    sendDiscordNotice(
      game,
      region,
      "Upload complete",
      summary,
      skippedDeletions.length > 0 ? 0xFFA500 : 0x00FF00,
    ).catch(() => { });

    return NextResponse.json({ success: true, requestId, updateMode, applied, statistics, changes });
  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Error in admin upload route");
    const message = error instanceof Error ? formatCatalogError(error) : "Internal server error";
    if (noticeContext) sendDiscordNotice(
      noticeContext.game,
      noticeContext.region,
      "Upload error",
      `**Request:** ${requestId}\n**Error:** ${message}`,
      0xFF0000,
    ).catch(() => { });
    return NextResponse.json(
      { error: message, requestId },
      { status: 500 }
    );
  } finally {
    // Serverless: ship buffered logs before the function is frozen/terminated.
    await flushLogger();
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
