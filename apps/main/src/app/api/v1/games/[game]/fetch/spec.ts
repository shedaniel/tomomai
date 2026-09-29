import { defineGameRoute, type RouteErrorResponse } from "@/lib/api/registry";
import { fetchStartResult, querySchemas } from "@/lib/api/schemas";
import { FETCH_START_ERROR_STATUS, type FetchStartErrorCode } from "@/lib/games/fetch-error-codes";

const REFUSALS: { [C in FetchStartErrorCode]: Pick<RouteErrorResponse, "description" | "retryAfter"> } = {
  NO_TOKEN_FOUND: { description: "No upstream token is stored for this region." },
  TOKEN_UNREADABLE: { description: "The stored upstream token cannot be read. Add it again in the app." },
  CN_COOKIES_SINGLE_USE: { description: "The stored China session token was already used. Sign in again in the app." },
  NO_USE_ALBUMS_SETTINGS: { description: "No album preference is set. Fetch once in the app to choose one." },
  MAINTENANCE: { description: "The game site is in its maintenance window.", retryAfter: true },
  FETCH_IN_PROGRESS: { description: "A fetch is already running for this region." },
  RATE_LIMITED: { description: "Too many fetches were started recently.", retryAfter: true },
};

export const spec = defineGameRoute({
  method: "POST",
  path: "/api/v1/games/{game}/fetch",
  tag: "Fetch",
  summary: "Trigger a game data fetch",
  description:
    "Starts a new background fetch with the user's stored upstream token. " +
    "API callers cannot supply a new token, because that flow lives in-app. " +
    "Poll `GET /api/v1/games/{game}/fetch/status` for progress. " +
    "A refused fetch answers with one of the error codes listed below.",
  scope: "fetch:start",
  capability: "scores",
  cost: 40,
  query: querySchemas.regionRequired,
  response: fetchStartResult,
  errors: (Object.keys(REFUSALS) as FetchStartErrorCode[]).map(code => ({
    code,
    status: FETCH_START_ERROR_STATUS[code].http,
    ...REFUSALS[code],
  })),
});
