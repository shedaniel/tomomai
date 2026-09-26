import { defineGameRoute as defineRoute } from "@/lib/api/registry";
import { fetchStartResult, querySchemas } from "@/lib/api/schemas";

export const spec = defineRoute({
  method: "POST",
  path: "/api/v1/games/{game}/fetch",
  tag: "Fetch",
  summary: "Trigger a game data fetch",
  description:
    "Starts a new background fetch against the user's stored upstream " +
    "upstream token. The token is taken from the server's stored copy — API " +
    "callers cannot supply a new token; that flow lives in-app. Poll " +
    "`GET /api/v1/games/{game}/fetch/status` for progress.\n\n" +
    "Returns `412` if no token is stored; `409` if a fetch is already in " +
    "progress; `429` if upstream is rate-limiting.",
  scope: "fetch:start",
  cost: 40,
  query: querySchemas.regionRequired,
  response: fetchStartResult,
});
