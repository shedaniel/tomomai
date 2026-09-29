import { adminRoute } from "@/lib/api/admin-route";
import { AdminRequestError } from "@/server/services/catalog/admin-game";
import { catalogRevalidationBody, revalidateCatalogLocal } from "@/server/services/catalog/revalidation";

// Called by the site that wrote the catalog, so it must not fan out to peers again.
export const POST = adminRoute("admin/catalog/revalidate", async ({ request, game, log, requestId }) => {
  const body = catalogRevalidationBody.safeParse(await request.json().catch(() => undefined));
  if (!body.success) throw new AdminRequestError("Body must be { affected?: { songName, artist, chartType }[] }");
  const { pages, count } = await revalidateCatalogLocal(game, body.data.affected);
  log.info({ scope: pages, count }, "Catalog caches revalidated");
  return Response.json({ success: true, requestId, pages, count });
}, { game: "read" });
