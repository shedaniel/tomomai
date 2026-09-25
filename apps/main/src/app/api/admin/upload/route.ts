import { getAdminCatalogRegions, resolveAdminGame } from "@/lib/api/admin-game";
import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { gameErrorResponse } from "@/lib/api/game-context";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import type { Region } from "@/lib/types";
import { getGameChartTypeKey } from "@/lib/games/presentation";
import { parseCatalogUpload } from "@/lib/catalog/parse-upload";
import { value } from "@/server/utils/admin/type";
import { sendDiscordNotice, sendDiscordWebhook } from "@/server/services/admin/discord-webhooks";
import { publishSongCatalog } from "@/server/services/admin/song-catalog";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSongSlugs } from "@/lib/song-slug";
import { locales } from "@tomomai/i18n/locale";
import { parseCatalogVersion } from "@/lib/catalog/parse-version";
import { NextRequest, NextResponse } from "next/server";

import { ingestCatalog } from "@/server/services/games/catalog-ingestion";
export type { FieldChange, AddedChange, ModifiedChange, DeletedChange } from "@/server/services/games/catalog-persistence";
type UpdateMode = "noop" | "alter" | "destructive";
/**
 * Push catalog edits to the ISR cache without waiting for the 14-day
 * revalidate window. Busts the shared songs data cache, then regenerates
 * each affected song-detail page (per locale) plus the list pages.
 */
async function revalidateSongsCache(
  game: CanonicalGameId,
  affected: Array<{ songName: string; artist: string; type: string }>,
  log: (obj: unknown, msg?: string) => void,
  forceBulk = false,
) {
  revalidateTag(`all-unique-songs:${game}`, { expire: 3600 });
  revalidateTag(`reserved-songs:${game}`, { expire: 0 });
  revalidateTag(`api-v1-songs:${game}`, { expire: 0 });

  const seen = new Set<string>();
  const deduped = affected.filter((song) => {
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
    const region = searchParams.get('region') as Region;
    const versionParam = searchParams.get('version');
    const updateParam = searchParams.get('update');
    const updateMode: UpdateMode = (updateParam === "alter" || updateParam === "destructive" || updateParam === "noop")
      ? updateParam
      : "noop";

    if (!region || !getAdminCatalogRegions(game).includes(region)) {
      return NextResponse.json(
        { error: `Missing or invalid 'region' query parameter. Must be one of: ${getAdminCatalogRegions(game).join(", ")}` },
        { status: 400 }
      );
    }

    if (!versionParam) {
      return NextResponse.json(
        { error: "Missing 'version' query parameter" },
        { status: 400 }
      );
    }

    let version: number;
    try {
      version = parseCatalogVersion(game, region, versionParam);
    } catch {
      return NextResponse.json(
        { error: "Invalid 'version' query parameter. Must be a supported catalog version for the region" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    let uploadSongs;
    try {
      uploadSongs = await parseCatalogUpload(game, body.songs);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid catalog records", requestId }, { status: 400 });
    }

    // Enrich the request logger now that region/version are known
    log = log.child({ game, region, version });

    log.info({
      songCount: uploadSongs.length
    }, "Upload merge analysis starting");

    const { dbSongs, mergedSongs, changes, applied, mergeEvents, addedSongs } = await ingestCatalog({ game, region, version, uploadSongs, updateMode, log });

    const appliedCount = applied.added + applied.modified + applied.deleted;
    if (updateMode !== "noop") {
      // Publish first: ISR invalidation must never advertise catalog changes
      // while the stable API object still contains the previous DB state.
      const publication = await publishSongCatalog(game);
      log.info({ count: publication.songCount }, "Published public song catalog to R2");
    }

    log.info({ updateMode, applied: { added: applied.added, modified: applied.modified, deleted: applied.deleted } }, "DB update complete");

    // Push only committed edits to ISR; preserve both slug inputs for renames.
    if (updateMode !== "noop") {
      const modifiedDbIds = new Set(changes.modified.map(change => change.dbId));
      const modifiedSongs = mergeEvents
        .filter(({ existing }) => {
          const dbId = existing.extras?.dbId;
          return dbId && modifiedDbIds.has(String(dbId));
        })
        .flatMap(({ existing, result }) => [existing, result])
        .map(song => ({ songName: song.songName, artist: value(song.artist) ?? "", type: getGameChartTypeKey(game, song.chartType) }));
      const appliedDeletions = (updateMode === "destructive"
        ? changes.deleted
        : changes.deleted.filter(change => (change.playRecordCount ?? 0) === 0));
      const affectedSongs = [
        ...addedSongs.map(song => ({ songName: song.songName, artist: value(song.artist) ?? "", type: getGameChartTypeKey(game, song.chartType) })),
        ...modifiedSongs,
        ...appliedDeletions.map(change => ({ songName: change.songName, artist: change.artist, type: getGameChartTypeKey(game, change.chartType) })),
      ];
      try {
        await revalidateSongsCache(game, affectedSongs, (obj, msg) => log.info(obj, msg ?? ""), appliedCount === 0);
      } catch (err) {
        log.error({ err }, "Failed to revalidate songs ISR cache");
      }
    }

    // Send Discord webhook if changes were applied
    if (updateMode !== "noop") {
      const actuallyDeleted = updateMode === "destructive" ? changes.deleted : changes.deleted.filter(d => d.playRecordCount === 0);
      sendDiscordWebhook(game, region, changes.added, actuallyDeleted, changes.modified).catch(err => {
        log.error({ err }, "Failed to send Discord webhook");
      });
    }

    // Send notice webhook with upload summary
    {
      const skippedDeletions = updateMode !== "destructive"
        ? changes.deleted.filter(d => (d.playRecordCount ?? 0) > 0)
        : [];
      let desc = `**Mode:** ${updateMode}\n**Input:** ${uploadSongs.length} | **DB:** ${dbSongs.length} | **Merged:** ${mergedSongs.length}\n**Applied:** +${applied.added} ~${applied.modified} -${applied.deleted}`;
      if (skippedDeletions.length > 0) {
        desc += `\n\n**${skippedDeletions.length} deletion(s) skipped** (have saved user references):\n`;
        desc += skippedDeletions.slice(0, 15).map(d => `- ${d.songKey} (${d.playRecordCount} references)`).join("\n");
        if (skippedDeletions.length > 15) desc += `\n... and ${skippedDeletions.length - 15} more`;
      }
      sendDiscordNotice(
        region,
        "Upload complete",
        desc,
        skippedDeletions.length > 0 ? 0xFFA500 : 0x00FF00,
      ).catch(() => { });
    }

    // Return response
    return NextResponse.json({
      success: true,
      requestId,
      updateMode,
      applied,
      statistics: {
        inputSongs: uploadSongs.length,
        dbSongs: dbSongs.length,
        mergedSongs: mergedSongs.length,
        added: changes.added.length,
        modified: changes.modified.length,
        deleted: changes.deleted.length,
        unchanged: changes.unchanged.length
      },
      changes: {
        added: changes.added,
        modified: changes.modified,
        deleted: changes.deleted,
        unchanged: changes.unchanged
      }
    });
  } catch (error) {
    if (error instanceof GameAdapterError) return gameErrorResponse(error);
    log.error({ err: error }, "Error in admin upload route");
    sendDiscordNotice(
      "intl",
      "Upload error",
      `**Error:** ${error instanceof Error ? error.message : String(error)}`,
      0xFF0000,
    ).catch(() => { });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    // Serverless: ship buffered logs before the function is frozen/terminated.
    await flushLogger();
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
