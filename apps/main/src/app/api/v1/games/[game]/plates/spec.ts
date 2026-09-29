import { z } from "zod";
import { defineGameRoute } from "@/lib/api/registry";
import { plateEntry, querySchemas } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/plates",
  tag: "Plates",
  summary: "List songs still needed for a plate",
  description:
    "Evaluates plate completion against the user's latest snapshot in the " +
    "given region. Returns the subset of songs (at the specified " +
    "`version` and `difficulty`) that still need an FC / SSS / AP / " +
    "FDX depending on the `plateType`, with the snapshot's score codes. " +
    "A chart the user never played has zero score and status codes. " +
    "Empty array if the user has no snapshot in this region.",
  scope: "plate:read",
  capability: "plates",
  cost: 2,
  query: querySchemas.plates,
  response: z.object({
    songs: z.array(plateEntry),
  }),
});
