import { z } from "zod";
import { defineRoute } from "@/lib/api/registry";
import { querySchemas, snapshotMetadata } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/snapshots",
  tag: "Snapshots",
  summary: "List all snapshots for the authenticated user",
  description:
    "Returns metadata for every snapshot tomomai has captured for the user " +
    "in the given region. Newer snapshots come first.",
  scope: "snapshot:all:metadata:read",
  cost: 2,
  query: querySchemas.regionRequired,
  response: z.object({
    snapshots: z.array(snapshotMetadata),
  }),
});
