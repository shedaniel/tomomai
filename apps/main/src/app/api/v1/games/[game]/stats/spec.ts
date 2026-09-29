import { defineGameRoute } from "@/lib/api/registry";
import { querySchemas, statsResponse } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/stats",
  tag: "Stats",
  summary: "Get grade and status distributions",
  description:
    "Returns how the scores of the user's latest snapshot in the given region spread over grades " +
    "and each score status the game records, grouped by the charts' added version and then by " +
    "difficulty code. Status counts are keyed by status code. `totalSongs` counts the catalog " +
    "charts per added version and difficulty code, so clients can render percentages.",
  scope: "stats:read",
  capability: "stats",
  cost: 2,
  query: querySchemas.regionRequired,
  response: statsResponse,
});
