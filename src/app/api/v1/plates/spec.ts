import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { plateEntry, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/plates",
  tag: "Plates",
  summary: "List songs still needed for a plate",
  description:
    "Evaluates plate completion against the user's latest snapshot in the " +
    "given region. Returns the subset of songs (at the specified " +
    "`version` and `difficulty`) that still need clearing / SSS / AP / " +
    "FDX depending on the `plateType`. Empty array if the user has no " +
    "snapshot in this region.",
  scope: "plate:read",
  query: querySchemas.plates,
  response: z.object({
    songs: z.array(plateEntry),
  }),
});
