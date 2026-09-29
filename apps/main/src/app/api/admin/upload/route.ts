import { adminRoute } from "@/lib/api/admin-route";
import { AdminRequestError, requireAdminCatalogVersion, requireAdminRegion } from "@/server/services/catalog/admin-game";
import { applyCatalogUpload } from "@/server/services/catalog/apply";
import { parseCatalogUpload } from "@/server/services/catalog/ingestion/parse-upload";
import { parseCatalogUpdateMode } from "@/server/services/catalog/ingestion/persistence/analyze";
import type { CatalogChart } from "@/server/services/catalog/ingestion/schema";
import type { CanonicalGameId } from "@/lib/games/types";

export const POST = adminRoute("admin/upload", async ({ request, game, log, requestId }) => {
  const { searchParams } = request.nextUrl;
  const region = requireAdminRegion(game, searchParams);
  const versionParam = searchParams.get("version");
  if (!versionParam) throw new AdminRequestError("Missing 'version' query parameter");
  const version = requireAdminCatalogVersion(game, region, versionParam);
  const charts = parseUploadBody(game, await request.json().catch(() => null));

  const outcome = await applyCatalogUpload({
    game, region, version, charts, mode: parseCatalogUpdateMode(searchParams.get("update")), log, requestId,
  });
  return Response.json({ success: true, requestId, ...outcome });
}, { game: "write" });

function parseUploadBody(game: CanonicalGameId, body: unknown): CatalogChart[] {
  const songs = typeof body === "object" && body !== null && "songs" in body ? body.songs : undefined;
  try {
    return parseCatalogUpload(game, songs);
  } catch (error) {
    throw new AdminRequestError(error instanceof Error ? error.message : "Invalid catalog records", { cause: error });
  }
}
