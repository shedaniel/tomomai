import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { paramSchemas, querySchemas, recentPlay } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/recents",
  tag: "maimai · Recents",
  summary: "List recent plays",
  description:
    "Returns the user's recent play history, newest first. Pagination via " +
    "`limit` / `offset` (limit defaults to 50, max 100). Each play includes " +
    "basic score data; with `recent:detailed:read`, the response also " +
    "includes venue and per-note-type breakdowns.",
  scope: "recent:read",
  optionalScopes: [
    {
      scope: "recent:detailed:read",
      effect: "Adds `venue`, `combo`, `syncScore`, `rating`, and the `notes` per-note breakdown.",
    },
  ],
  cost: 2,
  params: paramSchemas.game,
  query: querySchemas.paginated,
  response: z.object({
    plays: z.array(recentPlay),
    totalCount: z.number().int(),
    hasMore: z.boolean(),
  }),
});
