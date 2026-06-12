import { defineRoute } from "@/lib/api/registry";
import { paramSchemas, querySchemas, statsResponse } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/stats",
  tag: "maimai · Stats",
  summary: "Get grade / FC / FS distribution",
  description:
    "Returns the user's grade, full-combo, and full-sync distributions for " +
    "the given region, grouped by added-version then difficulty. Also " +
    "returns `totalSongs`, the count of songs in the catalogue per version × " +
    "difficulty so the client can render percentages.",
  scope: "stats:read",
  cost: 2,
  params: paramSchemas.game,
  query: querySchemas.regionRequired,
  response: statsResponse,
});
