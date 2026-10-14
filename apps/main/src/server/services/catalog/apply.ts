import "server-only";
import type { Logger } from "pino";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getCurrentVersion } from "@/lib/games/versions";
import { awaitWrapper } from "@/lib/utils";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { AdminRequestError } from "./admin-game";
import { formatCatalogError } from "./errors";
import { assertCoverHostingEnabled, assertCoversHosted, processCatalogImages } from "./images";
import { authenticateCatalogSource, collectCatalog } from "./ingestion/collect";
import { parseCatalogUpload } from "./ingestion/parse-upload";
import { persistCatalog, type CatalogPersistResult } from "./ingestion/persistence";
import type { CatalogUpdateMode } from "./ingestion/persistence/analyze";
import type { CatalogChart } from "./ingestion/schema";
import { sendDiscordWebhook } from "./notifications";
import { publishSongCatalog } from "./publication";
import { revalidateCatalog } from "./revalidation";

type CatalogRegionRequest = { game: CanonicalGameId; region: Region; log: Logger; requestId: string };

export type CatalogUploadOutcome = Pick<CatalogPersistResult, "applied" | "statistics" | "changes"> & {
  updateMode: CatalogUpdateMode;
};

const LISTED_SKIPPED_DELETIONS = 15;

/** Logs in to the catalog source when the region needs it and collects the region's catalog for `version`. */
export async function collectCatalogRegion({ game, region, version, sourceToken, log, requestId }: CatalogRegionRequest & {
  version: number;
  sourceToken: string | null;
}): Promise<CatalogChart[]> {
  const regionLog = log.child({ region, version });
  const [cookies, authError] = await awaitWrapper(authenticateCatalogSource(game, region, sourceToken));
  if (authError) {
    regionLog.error({ err: authError }, "Catalog source authentication failed");
    throw new AdminRequestError(authError.message, { cause: authError });
  }
  regionLog.info("Catalog collection starting");
  try {
    const charts = await collectCatalog(game, { region, version, session: { cookies: cookies ?? "" }, log: regionLog });
    regionLog.info({ count: charts.length }, "Catalog collected");
    return charts;
  } catch (error) {
    noticeFailure(game, region, "Fetch pipeline error", requestId, error);
    throw error;
  }
}

/**
 * Writes an uploaded region slice. Outside noop mode it then publishes the catalog, invalidates its
 * caches and posts the public change webhook. It always posts the summary notice.
 */
export async function applyCatalogUpload({ game, region, version, charts, mode, log, requestId }: CatalogRegionRequest & {
  version: number;
  charts: CatalogChart[];
  mode: CatalogUpdateMode;
}): Promise<CatalogUploadOutcome> {
  // A noop preview writes nothing, so it may compare collected charts whose covers are not hosted yet.
  if (mode !== "noop") assertCoversHosted(game, charts);
  const uploadLog = log.child({ region, version });
  try {
    uploadLog.info({ songCount: charts.length, updateMode: mode }, "Upload merge analysis starting");
    const result = await persistCatalog(game, region, version, charts, mode, uploadLog);
    const { applied } = result;

    if (mode !== "noop") {
      // Publish first: ISR invalidation must never advertise catalog changes
      // while the stable API object still contains the previous DB state.
      const publication = await publishSongCatalog(game);
      uploadLog.info({ songCount: publication.songCount }, "Published public song catalog to R2");
    }
    uploadLog.info({ updateMode: mode, applied: { added: applied.added, modified: applied.modified, deleted: applied.deleted } }, "DB update complete");

    if (mode !== "noop") {
      const appliedCount = applied.added + applied.modified + applied.deleted;
      // An upload that changed no chart is a republish, so it refreshes every page.
      await revalidateCatalog(game, { affected: appliedCount === 0 ? undefined : result.affected, log: uploadLog });
      sendDiscordWebhook(game, region, result.changes.added, result.appliedDeletions, result.changes.modified).catch(err => {
        uploadLog.error({ err }, "Failed to send Discord webhook");
      });
    }

    sendDiscordNotice(
      game,
      region,
      "Upload complete",
      uploadSummary(mode, result),
      result.skippedDeletions.length > 0 ? 0xFFA500 : 0x00FF00,
    ).catch(() => { });

    return { updateMode: mode, applied, statistics: result.statistics, changes: result.changes };
  } catch (error) {
    noticeFailure(game, region, "Upload error", requestId, error);
    throw error;
  }
}

/** Collects a region's current catalog, hosts its covers when asked, and applies it in alter mode. */
export async function updateCatalogRegion({ game, region, sourceToken, hostImages, log, requestId }: CatalogRegionRequest & {
  sourceToken: string | null;
  hostImages: boolean;
}): Promise<CatalogUploadOutcome> {
  assertCoverHostingEnabled(game, hostImages);
  const version = getCurrentVersion(game, region);
  const collected = await collectCatalogRegion({ game, region, version, sourceToken, log, requestId });
  const hosted = hostImages ? (await processCatalogImages(game, collected, log.child({ region }))).charts : collected;
  // The same contract as an upload, so a broken source cannot write what an upload would be refused.
  const charts = parseCatalogUpload(game, hosted);
  return applyCatalogUpload({ game, region, version, charts, mode: "alter", log, requestId });
}

function uploadSummary(mode: CatalogUpdateMode, { statistics, applied, skippedDeletions }: CatalogPersistResult): string {
  let summary = `**Mode:** ${mode}\n**Input:** ${statistics.inputSongs} | **DB:** ${statistics.dbSongs} | **Merged:** ${statistics.mergedSongs}\n**Applied:** +${applied.added} ~${applied.modified} -${applied.deleted}`;
  if (skippedDeletions.length > 0) {
    summary += `\n\n**${skippedDeletions.length} deletion(s) skipped** (have saved user references):\n`;
    summary += skippedDeletions.slice(0, LISTED_SKIPPED_DELETIONS).map(d => `- ${d.label} (${d.playRecordCount} references)`).join("\n");
    if (skippedDeletions.length > LISTED_SKIPPED_DELETIONS) summary += `\n... and ${skippedDeletions.length - LISTED_SKIPPED_DELETIONS} more`;
  }
  return summary;
}

function noticeFailure(game: CanonicalGameId, region: Region, title: string, requestId: string, error: unknown): void {
  const message = error instanceof Error ? formatCatalogError(error) : String(error);
  sendDiscordNotice(game, region, title, `**Request:** ${requestId}\n**Error:** ${message}`, 0xFF0000).catch(() => { });
}
