import { TRPCError } from "@trpc/server";
import { FRESH_SESSION_ERROR_CODE, isSessionFresh } from "./fresh-session";

export function requireFreshSession(session: { session: { createdAt: Date | string } }): void {
  if (!isSessionFresh(session.session.createdAt)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: FRESH_SESSION_ERROR_CODE,
      cause: { code: FRESH_SESSION_ERROR_CODE },
    });
  }
}
