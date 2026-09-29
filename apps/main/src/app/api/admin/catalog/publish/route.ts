import { adminRoute } from "@/lib/api/admin-route";
import { publishSongCatalog } from "@/server/services/catalog/publication";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = adminRoute("admin/catalog/publish", async ({ game, log, requestId }) => {
  const publication = await publishSongCatalog(game);
  revalidateTag(`all-unique-songs:${game}`, { expire: 0 });
  revalidateTag(`reserved-songs:${game}`, { expire: 0 });
  revalidateTag(`api-v1-songs:${game}`, { expire: 0 });
  log.info({ songCount: publication.songCount, size: publication.bytes }, "Published public song catalog to R2");
  return Response.json({ success: true, game, requestId, ...publication });
}, { game: "write" });
