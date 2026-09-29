import { defineGameRoute } from "@/lib/api/registry";
import { fetchStartResult, querySchemas } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "POST",
  path: "/api/v1/games/{game}/fetch",
  tag: "Fetch",
  summary: "Trigger a game data fetch",
  description:
    "Starts a new background fetch with the user's stored upstream token. " +
    "API callers cannot supply a new token, because that flow lives in-app. " +
    "Poll `GET /api/v1/games/{game}/fetch/status` for progress.\n\n" +
    "A refused fetch answers with an error `code`: `412` when the stored token " +
    "is missing, unreadable or single-use, or no album preference is set, " +
    "`409` when a fetch is already in progress, `429` after 5 fetches within " +
    "5 minutes and `503` during the game's maintenance window. `429` and `503` " +
    "carry `Retry-After`.",
  scope: "fetch:start",
  capability: "scores",
  cost: 40,
  query: querySchemas.regionRequired,
  response: fetchStartResult,
});
