import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { plateEntry, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/plates",
  tag: "maimai · Plates",
  summary: "List songs still needed for a plate",
  description:
    "Evaluates plate completion against the user's latest snapshot in the " +
    "given region. Returns the subset of songs (at the specified " +
    "`version` and `difficulty`) that still need clearing / SSS / AP / " +
    "FDX depending on the `plateType`. Empty array if the user has no " +
    "snapshot in this region. Plates are a maimai feature.",
  scope: "plate:read",
  cost: 2,
  params: z.object({
    game: z.literal("maimai").describe("Game to read data from. Plates are a maimai feature."),
  }),
  query: querySchemas.plates,
  response: z.object({
    songs: z.array(plateEntry),
  }),
});
