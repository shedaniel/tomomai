import { defineRoute } from "@/lib/api/registry";
import { fetchStartResult, paramSchemas, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "POST",
  path: "/api/v1/{game}/fetch",
  tag: "maimai · Fetch",
  summary: "Trigger a maimai data fetch",
  description:
    "Starts a new background fetch against the user's stored upstream " +
    "maimai token. The token is taken from the server's stored copy — API " +
    "callers cannot supply a new token; that flow lives in-app. Poll " +
    "`GET /api/v1/{game}/fetch/status` for progress.\n\n" +
    "Returns `412` if no token is stored; `409` if a fetch is already in " +
    "progress; `429` if upstream is rate-limiting.",
  scope: "fetch:start",
  cost: 40,
  params: paramSchemas.game,
  query: querySchemas.regionRequired,
  response: fetchStartResult,
});
