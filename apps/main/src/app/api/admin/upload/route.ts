import { resolveAdminGame } from "@/server/services/catalog/admin-game";
import { getSupportedRegions } from "@/lib/games/regions";
import { GameAdapterError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId } from "@/lib/games/types";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import type { Region } from "@/lib/types";
import { keyOf } from "@/lib/games/codes";
import { parseCatalogUpload } from "@/server/services/catalog/ingestion/parse-upload";
import { sendDiscordWebhook } from "@/server/services/catalog/notifications";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSongSlugs } from "@/lib/song-slug";
import { locales } from "@tomomai/i18n/locale";
import { parseCatalogVersion } from "@/lib/catalog/parse-version";
import { NextRequest, NextResponse } from "next/server";
import { persistCatalog, type AffectedChart } from "@/server/services/catalog/ingestion/persistence";
import { parseCatalogUpdateMode } from "@/server/services/catalog/ingestion/persistence/analyze";
import { formatCatalogError } from "@/server/services/catalog/errors";

/**
 * Push catalog edits to the ISR cache without waiting for the 14-day
 * revalidate window. Busts the shared songs data cache, then regenerates
 * each affected song-detail page (per locale) plus the list pages.
 */
async function revalidateSongsCache(
  game: CanonicalGameId,
  affected: AffectedChart[],
  log: (obj: unknown, msg?: string) => void,
  forceBulk = false,
) {
  revalidateTag(`all-unique-songs:${game}`, { expire: 3600 });
  revalidateTag(`reserved-songs:${game}`, { expire: 0 });
  revalidateTag(`api-v1-songs:${game}`, { expire: 0 });

  const seen = new Set<string>();
  const deduped = affected
    .map(chart => ({ songName: chart.songName, artist: chart.artist, type: keyOf(game, "chartType", chart.chartType) }))
    .filter((song) => {
      const key = `${song.songName}||${song.artist}||${song.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const withSlugs = await getSongSlugs(deduped, game);
  const slugs = new Set(withSlugs.map((song) => song.slug));

  // Bulk uploads can touch hundreds of songs, so avoid thousands of calls.
  const bulk = forceBulk || slugs.size > 200;
  for (const locale of locales) {
    if (bulk) {
      revalidatePath(`/${locale}/db/songs/[slug]`, "page");
    } else {
      for (const slug of slugs) {
        revalidatePath(`/${locale}/db/songs/${slug}`, "page");
      }
    }
    revalidatePath(`/${locale}/db/songs`, "page");
  }
  revalidatePath("/sitemap.xml", "page");

  log({ count: slugs.size, scope: bulk ? "bulk" : "songs" }, "ISR cache revalidated");
}

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
      try {
        await revalidateSongsCache(game, affected, (obj, msg) => log.info(obj, msg ?? ""), appliedCount === 0);
      } catch (err) {
        log.error({ err }, "Failed to revalidate songs ISR cache");
      }
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
