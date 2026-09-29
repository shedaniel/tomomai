import { defineGameRoute } from "@/lib/api/registry";
import { querySchemas, statsResponse } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/stats",
  tag: "Stats",
  summary: "Get grade / FC / FS distribution",
  description:
    "Returns the user's grade, full-combo, and full-sync distributions for " +
    "the given region, grouped by added-version then difficulty. Also " +
    "returns `totalSongs`, the count of songs in the catalogue per version × " +
    "difficulty so the client can render percentages.",
  scope: "stats:read",
  capability: "stats",
  cost: 2,
  query: querySchemas.regionRequired,
  response: statsResponse,
});
