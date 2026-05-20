import { defineRoute } from "@/lib/api/registry";
import { fetchStartResult, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "POST",
  path: "/api/v1/fetch",
  tag: "Fetch",
  summary: "Trigger a maimai data fetch",
  description:
    "Starts a new background fetch against the user's stored upstream " +
    "maimai token. The token is taken from the server's stored copy — API " +
    "callers cannot supply a new token; that flow lives in-app. Poll " +
    "`GET /api/v1/fetch/status` for progress.\n\n" +
    "Returns `412` if no token is stored; `409` if a fetch is already in " +
    "progress; `429` if upstream is rate-limiting.",
  scope: "fetch:start",
  query: querySchemas.regionRequired,
  response: fetchStartResult,
});
