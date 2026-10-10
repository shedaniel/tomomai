import { z } from "zod";
import { defineGameRoute } from "@/lib/api/registry";
import { albumEntry, querySchemas } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/albums",
  tag: "Albums",
  summary: "List arcade photo album entries",
  description:
    "Returns the user's arcade album entries (metadata only). With " +
    "`album:images:read`, each entry's `imageUrl` is also populated. " +
    "Paginated via `limit` / `offset` (default limit 20, max 100).",
  scope: "album:read",
  capability: "albums",
  optionalScopes: [
    {
      scope: "album:images:read",
      effect:
        "Populates `imageUrl` with the resolved R2 URL (sensitive — photos may contain images of people).",
    },
  ],
  cost: 2,
  query: querySchemas.paginated,
  response: z.object({
    albums: z.array(albumEntry),
    hasMore: z.boolean(),
  }),
});
