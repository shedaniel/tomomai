import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { paramSchemas, songCatalogueEntry } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/songs",
  tag: "maimai · Songs",
  summary: "List the full song catalogue",
  description:
    "Returns every song & chart in the catalogue across all regions.",
  scope: "public",
  cost: 1,
  cacheSeconds: 3600,
  params: paramSchemas.game,
  response: z.object({
    songs: z.array(songCatalogueEntry),
  }),
});
