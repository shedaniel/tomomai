import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { expect, it } from "vitest";
import { GAME_ERROR_STATUS, GameAdapterError, gameErrorResponse, type GameAdapterErrorCode } from "./errors";

const PUBLIC_STATUS: Record<GameAdapterErrorCode, number> = {
  UNKNOWN_GAME: 400,
  UNSUPPORTED_REGION: 400,
  GAME_NOT_ENABLED: 422,
  UNSUPPORTED_CAPABILITY: 422,
};

it.each(Object.entries(PUBLIC_STATUS) as [GameAdapterErrorCode, number][])("answers %s with %i over HTTP and through tRPC", async (code, status) => {
  const response = gameErrorResponse(new GameAdapterError(code, "Rejected"));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: "Rejected", code });
  expect(getHTTPStatusCodeFromError(new TRPCError({ code: GAME_ERROR_STATUS[code].trpc }))).toBe(status);
});
