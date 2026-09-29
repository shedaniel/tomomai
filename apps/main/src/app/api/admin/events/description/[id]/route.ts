import { getPending } from "@/server/services/pending-confirmation";
import { adminRoute } from "@/lib/api/admin-route";
import type { EventsPendingPayload } from "@/server/services/games/maimai/events/diff";

export const GET = adminRoute<{ id: string }>("admin/events/description", async ({ params, requestId }) => {
  const pending = await getPending<EventsPendingPayload>(params.id);
  if (!pending) {
    return Response.json({ error: "Not found or expired", requestId }, { status: 404 });
  }
  if (pending.type !== "events") {
    return Response.json({ error: "Invalid type", requestId }, { status: 400 });
  }

  return new Response(pending.data.description, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}, { auth: "none" });
