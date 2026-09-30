import { GAME_ERROR_STATUS, type GameAdapterErrorCode } from "@/lib/games/errors";
import { INVALID_PARAMETER } from "./parse-input";
import type { RouteErrorResponse } from "./registry";

/** The error `code` of a 410 for a path that moved under `/api/v1/games/{game}`. */
export const MOVED = "MOVED";

// WRONG_SITE only answers admin catalog writes, which are not part of the public API.
const GAME_ERRORS: { readonly [C in Exclude<GameAdapterErrorCode, "WRONG_SITE">]: string } = {
  UNKNOWN_GAME: "The path names no game the API serves.",
  UNSUPPORTED_REGION: "The game does not serve this region on this deployment.",
  GAME_NOT_ENABLED: "The game enables no region on this deployment, so only its catalog is served.",
  UNSUPPORTED_CAPABILITY: "The game does not offer this endpoint, or not in this region.",
};

/** The codes any `/api/v1` route may answer. A route lists its own refusals in its spec's `errors`. */
export const API_ERROR_CODES: readonly RouteErrorResponse[] = [
  { status: 400, code: INVALID_PARAMETER, description: "A path or query parameter is missing or invalid." },
  ...(Object.keys(GAME_ERRORS) as (keyof typeof GAME_ERRORS)[]).map(code => ({
    status: GAME_ERROR_STATUS[code].http,
    code,
    description: GAME_ERRORS[code],
  })),
  { status: 410, code: MOVED, description: "The path moved under /api/v1/games/{game}. The body's location is the new path." },
].toSorted((a, b) => a.status - b.status);
