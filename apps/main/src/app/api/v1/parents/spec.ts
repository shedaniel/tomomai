import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { chartCatalogueEntry } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/parents",
  tag: "Songs",
  summary: "List every chart across all regions and versions",
  description:
    "Returns the canonical chart dictionary: one entry per chart (per difficulty), " +
    "independent of regions and game versions. Chart IDs here are the prefixes of the " +
    "composite instance IDs returned by /api/v1/songs.",
  scope: "public",
  cost: 1,
  cacheSeconds: 3600,
  response: z.object({
    parents: z.array(chartCatalogueEntry),
  }),
});
