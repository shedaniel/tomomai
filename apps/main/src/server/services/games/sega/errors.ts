import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/ids";

function retryHint(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) return "in a few minutes";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ERROR CODE 200001: "There are too many access within a short period, the
// connection has been locked currently." Every further request extends the
// lock, so nothing is retried once it shows up.
export class GameSiteLockedError extends Error {
  constructor(game: CanonicalGameId, readonly retryAfterSeconds?: number) {
    super(`${getGame(game).brand.netName} has temporarily locked the connection after too many requests (ERROR CODE 200001). Please try again ${retryHint(retryAfterSeconds)}.`);
    this.name = "GameSiteLockedError";
  }
}

// The shared request budget stayed exhausted for longer than a request may wait.
export class GameSiteBusyError extends Error {
  constructor(game: CanonicalGameId) {
    super(`${getGame(game).brand.netName} is busy with other fetches right now. Please try again in a few minutes.`);
    this.name = "GameSiteBusyError";
  }
}

export function isThrottlingError(error: unknown): error is GameSiteLockedError | GameSiteBusyError {
  return error instanceof GameSiteLockedError || error instanceof GameSiteBusyError;
}
