import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import type { CanonicalGameId, Region } from "./ids";
import type { GameCapability } from "./types";

export type GameAdapterErrorCode =
  | "UNKNOWN_GAME"
  | "GAME_NOT_ENABLED"
  | "UNSUPPORTED_REGION"
  | "UNSUPPORTED_CAPABILITY";

export class GameAdapterError extends Error {
  constructor(
    public readonly code: GameAdapterErrorCode,
    message: string,
    public readonly game?: CanonicalGameId,
    public readonly region?: Region,
    public readonly capability?: GameCapability,
  ) {
    super(message);
    this.name = "GameAdapterError";
  }
}

/** How every transport answers a rejected game, region or capability. */
export const GAME_ERROR_STATUS = {
  UNKNOWN_GAME: { http: 400, trpc: "BAD_REQUEST" },
  UNSUPPORTED_REGION: { http: 400, trpc: "BAD_REQUEST" },
  GAME_NOT_ENABLED: { http: 422, trpc: "UNPROCESSABLE_CONTENT" },
  UNSUPPORTED_CAPABILITY: { http: 422, trpc: "UNPROCESSABLE_CONTENT" },
} as const satisfies Record<GameAdapterErrorCode, { http: 400 | 422; trpc: TRPC_ERROR_CODE_KEY }>;

export function gameErrorResponse(error: GameAdapterError): Response {
  return Response.json({ error: error.message, code: error.code }, { status: GAME_ERROR_STATUS[error.code].http });
}
