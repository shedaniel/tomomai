import { TRPCError } from "@trpc/server";
import { FETCH_START_ERROR_STATUS, formatFetchError, type FetchStartErrorCode } from "@/lib/games/fetch-error-codes";
import { GAME_ERROR_STATUS, GameError, type GameErrorCode } from "@/lib/games/errors";

/** A fetch refused before its session started. The message is `CODE: detail`. */
export class FetchStartError extends Error {
  constructor(
    public readonly code: FetchStartErrorCode,
    detail: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(formatFetchError(code, detail));
    this.name = "FetchStartError";
  }
}

export function toTrpcFetchStartError(error: FetchStartError): TRPCError {
  return new TRPCError({ code: FETCH_START_ERROR_STATUS[error.code].trpc, message: error.message, cause: error });
}

export type FetchStartRejection = {
  code: FetchStartErrorCode | GameErrorCode;
  message: string;
  init: ResponseInit;
};

/**
 * The HTTP answer for an expected refusal to start a fetch, or null when the
 * failure is unexpected and the caller should answer with a server error.
 */
export function fetchStartRejection(error: unknown): FetchStartRejection | null {
  if (error instanceof FetchStartError) {
    const headers = error.retryAfterSeconds === undefined ? undefined : { "Retry-After": String(error.retryAfterSeconds) };
    return { code: error.code, message: error.message, init: { status: FETCH_START_ERROR_STATUS[error.code].http, headers } };
  }
  if (error instanceof GameError) {
    return { code: error.code, message: error.message, init: { status: GAME_ERROR_STATUS[error.code].http } };
  }
  return null;
}
