import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { gameSchema, songDetail } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/songs/{id}",
  tag: "maimai · Songs",
  summary: "Get a single song by public ID",
  description:
    "Returns the song with all chart difficulties merged into a single object, " +
    "including note designer and per-note-type counts.",
  scope: "public",
  cost: 1,
  params: z.object({
    game: gameSchema,
    id: z.string().describe("Public song ID (nanoid)."),
  }),
  response: songDetail,
});
