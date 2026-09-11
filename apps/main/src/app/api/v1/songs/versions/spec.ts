import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { regionSchema } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/songs/versions",
  tag: "Songs",
  summary: "Get available and current game versions for a region",
  description: "Use currentVersion as the gameVersion parameter for the current song catalogue.",
  scope: "public",
  cost: 1,
  cacheSeconds: 3600,
  query: z.object({ region: regionSchema }),
  response: z.object({
    currentVersion: z.number().int(),
    versions: z.array(z.object({ id: z.number().int(), name: z.string() })),
  }),
});
