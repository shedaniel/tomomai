import { logger } from "@/lib/logger";
import { adminRoute } from "../../admin-route";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { revalidateCatalog } from "@/server/services/catalog/revalidation";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = adminRoute("admin/catalog/publish", async ({game, requestId }) => {
  const publication = await publishSongCatalog(game);
  logger.info({ songCount: publication.songCount, size: publication.bytes }, "Published public song catalog to R2");
  await revalidateCatalog(game, { log: logger });
  return Response.json({ success: true, game, requestId, ...publication });
}, { game: "write" });
