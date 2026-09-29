import { adminRoute } from "@/lib/api/admin-route";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { revalidateCatalog } from "@/server/services/catalog/revalidation";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = adminRoute("admin/catalog/publish", async ({ game, log, requestId }) => {
  const publication = await publishSongCatalog(game);
  log.info({ songCount: publication.songCount, size: publication.bytes }, "Published public song catalog to R2");
  await revalidateCatalog(game, { log });
  return Response.json({ success: true, game, requestId, ...publication });
}, { game: "write" });
