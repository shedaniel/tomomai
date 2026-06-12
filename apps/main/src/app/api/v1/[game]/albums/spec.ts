import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { albumEntry, paramSchemas, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/albums",
  tag: "maimai · Albums",
  summary: "List arcade photo album entries",
  description:
    "Returns the user's arcade album entries (metadata only). With " +
    "`album:images:read`, each entry's `imageUrl` is also populated. " +
    "Paginated via `limit` / `offset` (default limit 20, max 100).",
  scope: "album:read",
  optionalScopes: [
    {
      scope: "album:images:read",
      effect:
        "Populates `imageUrl` with the resolved R2 URL (sensitive — photos may contain images of people).",
    },
  ],
  cost: 2,
  params: paramSchemas.game,
  query: querySchemas.paginated,
  response: z.object({
    albums: z.array(albumEntry),
    hasMore: z.boolean(),
  }),
});
