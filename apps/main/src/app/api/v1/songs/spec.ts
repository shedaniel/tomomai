import { defineRoute } from "@/lib/api/registry";
import { songCatalogue } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/songs",
  tag: "Songs",
  summary: "List the full song catalogue",
  description:
    "Returns every song & chart in the catalogue across all regions.",
  scope: "public",
  cost: 1,
  cacheSeconds: 3600,
  response: songCatalogue,
});
