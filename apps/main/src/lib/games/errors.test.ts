import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { expect, it } from "vitest";
import { GAME_ERROR_STATUS, GameError, gameErrorResponse, type GameErrorCode } from "./errors";

const PUBLIC_STATUS: Record<GameErrorCode, number> = {
  UNKNOWN_GAME: 400,
  UNSUPPORTED_REGION: 400,
  GAME_NOT_ENABLED: 422,
  UNSUPPORTED_CAPABILITY: 422,
  WRONG_SITE: 409,
};

it.each(Object.entries(PUBLIC_STATUS) as [GameErrorCode, number][])("answers %s with %i over HTTP and through tRPC", async (code, status) => {
  const response = gameErrorResponse(new GameError(code, "Rejected"));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: "Rejected", code });
  expect(getHTTPStatusCodeFromError(new TRPCError({ code: GAME_ERROR_STATUS[code].trpc }))).toBe(status);
});
