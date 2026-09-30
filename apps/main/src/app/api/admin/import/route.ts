import { adminRoute } from "../admin-route";
import { AdminRequestError, requireAdminCatalogVersion } from "@/server/services/catalog/admin-game";
import { getSupportedRegions } from "@/lib/games/regions";
import type { CanonicalGameId } from "@/lib/games/types";
import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { Region } from "@/lib/types";
import { resolveGameContext } from "@/lib/games/access";
import { and, eq, gte, lte } from "drizzle-orm";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { lockCatalogWrites } from "@/server/services/catalog/ingestion/lock";
import { excludedSet, INSTANCE_UPDATE_COLUMNS } from "@/server/services/catalog/ingestion/columns";
import { revalidateCatalog } from "@/server/services/catalog/revalidation";

const REGION_PATTERN = "[a-z]+";
const FROM_REGEX = new RegExp(`^version(<=|>=|=)(\\d+)@(${REGION_PATTERN})-(-?\\d+)$`);
const TO_REGEX = new RegExp(`^(${REGION_PATTERN})-(-?\\d+)$`);

function regionsHint(game: CanonicalGameId): string {
  return `[${getSupportedRegions(game).join("|")}]`;
}

function parseFromParameter(game: CanonicalGameId, from: string): {
  region: Region;
  gameVersion: number;
  versionFilter: "eq" | "lte" | "gte";
  versionValue: number;
} {
  // Expected format: "version<=10@intl-10" or "version=11@jp-11" or "version>=5@intl-10"
  const match = from.match(FROM_REGEX);

  if (!match) {
    throw new AdminRequestError(`Invalid 'from' parameter format. Expected format: version[<=|>=|=]NUMBER@${regionsHint(game)}-NUMBER`);
  }

  const [, operator, versionValue, region, gameVersion] = match;

  resolveGameContext(game, { region: region as Region, capability: "catalog", regionPolicy: "supported" });

  const versionFilter = operator === "<=" ? "lte" : operator === ">=" ? "gte" : "eq";

  return {
    region: region as Region,
    gameVersion: requireAdminCatalogVersion(game, region as Region, gameVersion),
    versionFilter,
    versionValue: parseInt(versionValue, 10),
  };
}

function parseToParameter(game: CanonicalGameId, to: string): {
  region: Region;
  gameVersion: number;
} {
  // Expected format: "intl-11" or "jp-12"
  const match = to.match(TO_REGEX);

  if (!match) {
    throw new AdminRequestError(`Invalid 'to' parameter format. Expected format: ${regionsHint(game)}-NUMBER`);
  }

  const [, region, gameVersion] = match;

  resolveGameContext(game, { region: region as Region, capability: "catalog", regionPolicy: "supported" });

  return {
    region: region as Region,
    gameVersion: requireAdminCatalogVersion(game, region as Region, gameVersion),
  };
}

function buildVersionFilter(versionFilter: "eq" | "lte" | "gte", versionValue: number) {
  switch (versionFilter) {
    case "eq":
      return eq(songs.addedVersion, versionValue);
    case "lte":
      return lte(songs.addedVersion, versionValue);
    case "gte":
      return gte(songs.addedVersion, versionValue);
    default:
      throw new Error(`Invalid version filter: ${versionFilter}`);
  }
}

export const GET = adminRoute("admin/import", async ({ request, game, log, requestId }) => {
  const { searchParams } = request.nextUrl;
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const mode = searchParams.get('mode'); // "only-upsert" or null (default: insert+upsert)

  if (!fromParam) {
    throw new AdminRequestError(`Missing 'from' query parameter. Expected format: version[<=|>=|=]NUMBER@${regionsHint(game)}-NUMBER`);
  }
  if (!toParam) {
    throw new AdminRequestError(`Missing 'to' query parameter. Expected format: ${regionsHint(game)}-NUMBER`);
  }
  if (mode && mode !== "only-upsert") {
    throw new AdminRequestError("Invalid 'mode' parameter. Must be 'only-upsert' or omitted");
  }

  log.info({ from: fromParam, to: toParam }, `Admin import requested (mode=${mode || 'insert+upsert'})`);

  const sourceConfig = parseFromParameter(game, fromParam);
  const targetConfig = parseToParameter(game, toParam);

  log.debug(`Import config: ${sourceConfig.region} v${sourceConfig.gameVersion} → ${targetConfig.region} v${targetConfig.gameVersion}`);

  const versionCondition = buildVersionFilter(sourceConfig.versionFilter, sourceConfig.versionValue);

  const result = await db.transaction(async (tx) => {
    await lockCatalogWrites(tx);
    const sourceSongs = await tx
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.game, game),
          eq(songs.region, sourceConfig.region),
          eq(songs.gameVersion, sourceConfig.gameVersion),
          versionCondition
        )
      );

    log.info({ count: sourceSongs.length }, "Found source songs matching criteria");

    if (sourceSongs.length === 0) {
      return Response.json({
        success: true,
        requestId,
        message: "No songs found matching the source criteria",
        statistics: {
          sourceFound: 0,
          imported: 0,
          updated: 0,
          skipped: 0,
          from: fromParam,
          to: toParam,
          mode: mode || 'insert+upsert',
          timestamp: new Date().toISOString(),
        },
      });
    }

    let existingTargetSongs: (typeof songs.$inferSelect)[] = [];

    if (mode === "only-upsert") {
      log.debug("Querying existing target songs for upsert mode");
      existingTargetSongs = await tx
        .select()
        .from(songs)
        .where(
          and(
            eq(songs.game, game),
            eq(songs.region, targetConfig.region),
            eq(songs.gameVersion, targetConfig.gameVersion)
          )
        );

      log.debug({ count: existingTargetSongs.length }, "Found existing songs in target");
    }

    const targetSongs: (typeof songs.$inferInsert)[] = [];
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const existingTargetMap = new Map<string, typeof songs.$inferSelect>();
    if (mode === "only-upsert") {
      existingTargetSongs.forEach(song => {
        const key = String(song.parentId);
        existingTargetMap.set(key, song);
      });
    }

    for (const sourceSong of sourceSongs) {
      const songKey = String(sourceSong.parentId);

      if (mode === "only-upsert") {
        if (!existingTargetMap.has(songKey)) {
          log.debug({ songKey }, "Skipping new song in upsert mode");
          skippedCount++;
          continue;
        }
        updatedCount++;
      } else {
        importedCount++;
      }

      const { id, ...songWithoutIds } = sourceSong;
      const targetSong = {
        ...songWithoutIds,
        region: targetConfig.region,
        gameVersion: targetConfig.gameVersion,
      };

      targetSongs.push(targetSong);
    }

    log.info({ count: targetSongs.length }, "Prepared songs for import");

    if (targetSongs.length > 0) {
      log.debug({ count: targetSongs.length }, "Performing batch upsert");

      try {
        // Split into batches of 1000 records to avoid SQL limits
        const batchSize = 1000;
        let totalProcessed = 0;

        for (let i = 0; i < targetSongs.length; i += batchSize) {
          const batch = targetSongs.slice(i, i + batchSize);
          log.debug(`Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetSongs.length / batchSize)} (${batch.length} songs)`);

          await tx.insert(songs).values(batch).onConflictDoUpdate({
            target: [songs.parentId, songs.region, songs.gameVersion],
            set: excludedSet(songs, INSTANCE_UPDATE_COLUMNS),
          });

          totalProcessed += batch.length;
        }

        log.debug({ count: totalProcessed }, "Upserted songs to target");
      } catch (error) {
        log.error({ err: error }, "Error during batch upsert");
        throw new Error(`Database upsert failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    const totalProcessed = mode === "only-upsert" ? updatedCount : importedCount;
    log.info({ count: totalProcessed, skipped: skippedCount }, "Import completed");

    return Response.json({
      success: true,
      requestId,
      message: "Song import completed successfully",
      statistics: {
        sourceFound: sourceSongs.length,
        imported: mode === "only-upsert" ? 0 : importedCount,
        updated: mode === "only-upsert" ? updatedCount : 0,
        skipped: skippedCount,
        totalProcessed: targetSongs.length,
        from: fromParam,
        to: toParam,
        mode: mode || 'insert+upsert',
        sourceConfig,
        targetConfig,
        timestamp: new Date().toISOString(),
      },
    });
  });
  await publishSongCatalog(game);
  await revalidateCatalog(game, { log });
  return result;
}, { game: "write" });
