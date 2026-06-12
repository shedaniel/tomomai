import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { gameSchema, querySchemas, snapshotDetail, successResponse } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/snapshots/{id}",
  tag: "maimai · Snapshots",
  summary: "Get a specific snapshot by public ID",
  description:
    "Same shape as `/snapshots/latest` but for any of the user's snapshots. " +
    "Returns `404` if the snapshot ID does not belong to the caller in the " +
    "given region.",
  scope: "snapshot:all:metadata:read",
  optionalScopes: [
    { scope: "snapshot:all:songs:read", effect: "Includes the full song-score array." },
    {
      scope: "snapshot:all:songs:b50:read",
      effect: "Includes only the user's B50 song scores when the full-songs scope is absent.",
    },
    { scope: "snapshot:all:events:read", effect: "Includes the `events` array." },
    {
      scope: "snapshot:all:icon:read",
      effect: "Populates `iconUrl` (sensitive — may reveal social identity).",
    },
  ],
  params: z.object({
    game: gameSchema,
    id: z.string().describe("Public snapshot ID."),
  }),
  cost: 2,
  query: querySchemas.regionRequired,
  response: snapshotDetail,
});

export const deleteSpec = defineRoute({
  method: "DELETE",
  path: "/api/v1/{game}/snapshots/{id}",
  tag: "maimai · Snapshots",
  summary: "Delete a snapshot",
  description:
    "Permanently deletes one of the caller's snapshots. Returns " +
    "`404` if the snapshot ID does not belong to the caller in the given " +
    "region.",
  scope: "snapshot:all:delete",
  cost: 10,
  params: z.object({
    game: gameSchema,
    id: z.string().describe("Public snapshot ID."),
  }),
  query: querySchemas.regionRequired,
  response: successResponse,
});
