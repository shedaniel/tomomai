import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { fetchStatus, regionSchema } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/fetch/status/stream",
  tag: "Fetch",
  summary: "Stream fetch status updates (Server-Sent Events)",
  description:
    "Server-Sent Events stream of the latest fetch session for the caller in " +
    "the given region. Emits a `status` event (data shaped like " +
    "`GET /api/v1/fetch/status`) whenever progress changes, then a final " +
    "`status` plus a `done` event once the fetch reaches `completed` or " +
    "`failed`, after which the stream closes. Use this instead of polling " +
    "`GET /api/v1/fetch/status`. Pass `sessionId` to restrict the stream to a " +
    "specific session; omit it to follow the latest session for the region.",
  scope: "fetch:read",
  cost: 5,
  query: z.object({
    region: regionSchema,
    sessionId: z
      .string()
      .optional()
      .describe("Restrict the stream to a specific fetch session id."),
  }),
  response: fetchStatus,
});
