import { withApiKey } from "@/lib/api/protect";

export const GET = withApiKey(["ready"], async () =>
  Response.json({ ok: true })
);
