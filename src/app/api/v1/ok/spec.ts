import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/ok",
  tag: "Health",
  summary: "Health check",
  description:
    "Returns `{ ok: true }` if your token is valid. Useful as a smoke test " +
    "during integration — the only scope this needs is `ready`, which every " +
    "token holds by default.",
  scope: "ready",
  response: z.object({ ok: z.literal(true) }),
  examples: [{ name: "Success", response: { ok: true } }],
});
