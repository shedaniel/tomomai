import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { songCatalogueEntry } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/songs",
  tag: "Songs",
  summary: "List the full song catalogue",
  description:
    "Returns every song & chart in the catalogue across all regions. The " +
    "response is cached on the edge for one hour — there is no user data in " +
    "it, so this endpoint is fully public (no token required).",
  scope: "public",
  cacheSeconds: 3600,
  response: z.object({
    songs: z.array(songCatalogueEntry),
  }),
});
