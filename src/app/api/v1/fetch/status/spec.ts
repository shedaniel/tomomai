import { defineRoute } from "@/lib/api/registry";
import { fetchStatus, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "GET",
  path: "/api/v1/fetch/status",
  tag: "Fetch",
  summary: "Get the status of the latest data fetch",
  description:
    "Returns the latest fetch session for the caller in the given region " +
    "— useful for polling after `POST /api/v1/fetch`. Returns `404` if no " +
    "fetch has ever been started for this region.",
  scope: "fetch:read",
  query: querySchemas.regionRequired,
  response: fetchStatus,
});
