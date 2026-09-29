import { adminRoute } from "@/lib/api/admin-route";
import { getCurrentVersion } from "@/lib/games/versions";
import { sortKeys } from "@/lib/utils";
import { requireAdminRegion } from "@/server/services/catalog/admin-game";
import { collectCatalogRegion } from "@/server/services/catalog/apply";

export const GET = adminRoute("admin/update", async ({ request, game, log, requestId }) => {
  const { searchParams } = request.nextUrl;
  const region = requireAdminRegion(game, searchParams);
  const charts = await collectCatalogRegion({
    game, region, version: getCurrentVersion(game, region), sourceToken: searchParams.get("token"), log, requestId,
  });
  return Response.json({
    success: true,
    requestId,
    message: "Song data update completed",
    records: charts.map(chart => sortKeys(chart)),
  });
}, { game: "read" });
