import { z } from "zod";
import { defineGameRoute } from "@/lib/api/registry";
import { songDetail } from "@/lib/api/schemas";
import { parseSongId } from "@/lib/catalog/song-instance-id";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/songs/{id}",
  tag: "Songs",
  summary: "Get a single song by public ID",
  description:
    "Returns one chart difficulty for the preferred or specified region and game version, " +
    "including its note designer and, in `details`, the game's note counts per kind.",
  scope: "public",
  capability: "catalog",
  cost: 1,
  cacheSeconds: 3600,
  params: z.object({
    id: z.string().refine(id => parseSongId(id) !== null, "Invalid song ID").describe("Chart ID (8-char nanoid) for the preferred instance, or a composite instance ID <chartId>:<regionLetter><gameVersion> (e.g. Ab3xK9pQ:j11) for an exact one."),
  }),
  response: songDetail,
});
