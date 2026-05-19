import { defineRoute } from "@/lib/api/registry";
import { querySchemas, snapshotDetail } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/snapshots/latest",
  tag: "Snapshots",
  summary: "Get the most recent snapshot",
  description:
    "Returns the latest snapshot for the given region, including any of the " +
    "optional sub-fields (`songs`, `events`, `iconUrl`) the caller has " +
    "scopes for. Missing scopes yield `null` for that field rather than an " +
    "error so a single request can cover multiple grants.",
  scope: "snapshot:latest:metadata:read",
  optionalScopes: [
    { scope: "snapshot:latest:songs:read", effect: "Includes the full song-score array." },
    {
      scope: "snapshot:latest:songs:b50:read",
      effect: "Includes only the user's B50 song scores when the full-songs scope is absent.",
    },
    { scope: "snapshot:latest:events:read", effect: "Includes the `events` array." },
    {
      scope: "snapshot:latest:icon:read",
      effect: "Populates `iconUrl` (sensitive — may reveal social identity).",
    },
  ],
  query: querySchemas.regionRequired,
  response: snapshotDetail,
});
