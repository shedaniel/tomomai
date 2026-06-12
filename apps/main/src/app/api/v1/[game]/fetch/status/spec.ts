import { defineRoute } from "@/lib/api/registry";
import { fetchStatus, paramSchemas, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/{game}/fetch/status",
  tag: "maimai · Fetch",
  summary: "Get the status of the latest data fetch",
  description:
    "Returns the latest fetch session for the caller in the given region " +
    "— useful for polling after `POST /api/v1/{game}/fetch`. Returns `404` if no " +
    "fetch has ever been started for this region.",
  scope: "fetch:read",
  cost: 2,
  params: paramSchemas.game,
  query: querySchemas.regionRequired,
  response: fetchStatus,
});
