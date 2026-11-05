import { z } from "zod";
import { defineGameRoute } from "@/lib/api/registry";
import { querySchemas, recentPlay } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/recents",
  tag: "Recents",
  summary: "List recent plays",
  description:
    "Returns the user's recent play history, newest first. Pagination via " +
    "`limit` / `offset` (limit defaults to 50, max 100). Each play has its " +
    "score, its chart and the game's own `details`. With `recent:detailed:read`, " +
    "`details.playlog` also carries the play's detail page, such as judgments and max combo.",
  scope: "recent:read",
  capability: "recents",
  optionalScopes: [
    {
      scope: "recent:detailed:read",
      effect: "Fills `details.playlog` with the play's detail page: judgments per note kind and max combo, plus venue and rating change for maimai.",
    },
  ],
  cost: 2,
  query: querySchemas.paginated,
  response: z.object({
    plays: z.array(recentPlay),
    totalCount: z.number().int(),
    hasMore: z.boolean(),
  }),
});
