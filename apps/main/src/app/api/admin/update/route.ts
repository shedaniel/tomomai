import { adminRoute } from "@/lib/api/admin-route";
import { AdminRequestError, requireAdminRegion } from "@/server/services/catalog/admin-game";
import { getCurrentVersion } from "@/lib/games/versions";
import { awaitWrapper, sortKeys } from "@/lib/utils";
import { sendDiscordNotice } from "@/server/services/discord/webhook";
import { authenticateCatalogSource, collectCatalog } from "@/server/services/catalog/ingestion/collect";
import { formatCatalogError } from "@/server/services/catalog/errors";

export const GET = adminRoute("admin/update", async ({ request, game, log, requestId }) => {
  const { searchParams } = request.nextUrl;
  const region = requireAdminRegion(game, searchParams);

  const [cookies, authError] = await awaitWrapper(authenticateCatalogSource(game, region, searchParams.get("token")));
  if (authError) {
    log.error({ err: authError, region }, "Catalog source authentication failed");
    throw new AdminRequestError(authError.message, { cause: authError });
  }
  log.info({ region }, "Admin catalog collection requested");

  try {
    const songs = await collectCatalog(game, {
      region,
      version: getCurrentVersion(game, region),
      session: { cookies: cookies ?? "" },
      log,
    });
    const newRecords = songs.map(record => sortKeys(record));
    log.info({ count: newRecords.length }, "Update completed successfully");
    return Response.json({
      success: true,
      requestId,
      message: "Song data update completed",
      records: newRecords,
    });
  } catch (error) {
    sendDiscordNotice(
      game,
      region,
      "Fetch pipeline error",
      `**Request:** ${requestId}\n**Error:** ${error instanceof Error ? formatCatalogError(error) : String(error)}`,
      0xFF0000,
    ).catch(() => { });
    throw error;
  }
}, { game: "read" });
