import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { regionSchema, songCatalogueEntry } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/songs",
  tag: "Songs",
  summary: "List the song catalogue for one region and game version",
  description:
    "Returns every song & chart available in the given region at the given game version. " +
    "Both query parameters are required; one chart appears exactly once per difficulty.",
  scope: "public",
  cost: 1,
  cacheSeconds: 3600,
  query: z.object({
    region: regionSchema,
    gameVersion: z.coerce
      .number()
      .int()
      .describe("Game version ID to list songs for (e.g. 13; negative IDs are classic-era versions)."),
  }),
  response: z.object({
    songs: z.array(songCatalogueEntry),
  }),
});
