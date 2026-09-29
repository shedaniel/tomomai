import { adminRoute } from "@/lib/api/admin-route";
import type { Region } from "@/lib/types";
import { AdminRequestError, getDefaultAdminCatalogRegions, requireAdminRegion } from "@/server/services/catalog/admin-game";
import { updateCatalogRegion, type CatalogUploadOutcome } from "@/server/services/catalog/apply";
import { catalogRequiresToken } from "@/server/services/catalog/ingestion/collect";

export const GET = adminRoute("admin/update_all", async ({ request, game, log, requestId }) => {
  const { searchParams } = request.nextUrl;
  const regions = searchParams.get("region") ? [requireAdminRegion(game, searchParams)] : getDefaultAdminCatalogRegions(game);
  const sourceToken = searchParams.get("token");
  const hostImages = searchParams.get("image_upload") !== "false";
  if (!sourceToken && regions.some(region => catalogRequiresToken(game, region))) {
    throw new AdminRequestError("Missing 'token' query parameter (required by catalog source)");
  }
  log.info({ regions, imageUpload: hostImages }, "Admin update_all requested");

  const results: Partial<Record<Region, CatalogUploadOutcome>> = {};
  for (const region of regions) {
    results[region] = await updateCatalogRegion({ game, region, sourceToken, hostImages, log, requestId });
  }
  return Response.json({
    success: true,
    requestId,
    message: `${regions.map(region => region.toUpperCase()).join(" and ")} updated successfully`,
    ...results,
  });
}, { game: "write" });
