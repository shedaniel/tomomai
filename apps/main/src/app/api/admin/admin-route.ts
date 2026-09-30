import "server-only";
import type { NextRequest } from "next/server";
import type { Logger } from "pino";
import { checkAdminToken, type AdminTokenCheck } from "@/lib/admin-token";
import { GameError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId } from "@/lib/games/ids";
import { flushLogger } from "@/lib/logger";
import { requestLogger, runWithLogger } from "@/lib/request-logger";
import { AdminRequestError, resolveAdminGame } from "@/server/services/catalog/admin-game";
import { formatCatalogError } from "@/server/services/catalog/errors";

type RouteParams = Record<string, string>;

type AdminRouteContext<P extends RouteParams> = {
  request: NextRequest;
  log: Logger;
  requestId: string;
  params: P;
};

type AdminGameRouteContext<P extends RouteParams> = AdminRouteContext<P> & { game: CanonicalGameId };

type AdminRouteHandler<P extends RouteParams> = (request: NextRequest, context?: { params: Promise<P> }) => Promise<Response>;

/** `read` accepts any game. `write` accepts only the game this deployment serves (WRONG_SITE otherwise). */
type AdminGameAccess = "read" | "write";

type AdminRouteOptions = {
  game?: AdminGameAccess;
  /** `none` is for links opened from a Discord notice, where an unguessable id in the path is the credential. */
  auth?: "token" | "none";
};

const TOKEN_REJECTIONS: Record<Exclude<AdminTokenCheck, "ok">, { status: number; error: string }> = {
  missing: { status: 401, error: "Missing authorization token" },
  unconfigured: { status: 500, error: "Server configuration error" },
  invalid: { status: 403, error: "Invalid authorization token" },
};

/**
 * Serves an admin route: checks the admin bearer token, binds the request logger, resolves `?game=` when
 * the route declares game access, answers rejections and failures as JSON with the request id, and
 * flushes the logs before a serverless function is frozen.
 */
export function adminRoute<P extends RouteParams = Record<string, never>>(
  name: string,
  handler: (ctx: AdminGameRouteContext<P>) => Promise<Response>,
  options: AdminRouteOptions & { game: AdminGameAccess },
): AdminRouteHandler<P>;
export function adminRoute<P extends RouteParams = Record<string, never>>(
  name: string,
  handler: (ctx: AdminRouteContext<P>) => Promise<Response>,
  options?: AdminRouteOptions & { game?: undefined },
): AdminRouteHandler<P>;
export function adminRoute<P extends RouteParams>(
  name: string,
  handler: (ctx: AdminGameRouteContext<P>) => Promise<Response>,
  options: AdminRouteOptions = {},
): AdminRouteHandler<P> {
  return async (request, context) => {
    const { log: requestLog, requestId } = requestLogger(request, name);
    let log = requestLog;
    try {
      if (options.auth !== "none") {
        const check = checkAdminToken(request.headers.get("authorization"));
        if (check !== "ok") {
          if (check === "unconfigured") log.error("ADMIN_UPDATE_TOKEN environment variable not set");
          if (check === "invalid") log.warn("Invalid admin token attempt");
          const { status, error } = TOKEN_REJECTIONS[check];
          return Response.json({ error, requestId }, { status });
        }
      }
      const params = ((await context?.params) ?? {}) as P;
      // The overloads only pair a handler that reads `game` with a route that resolves it.
      if (!options.game) return await handler({ request, log, requestId, params } as AdminGameRouteContext<P>);

      const game = resolveAdminGame(request.nextUrl.searchParams, { write: options.game === "write" });
      log = log.child({ game });
      const ctx = { request, log, requestId, params, game };
      return await runWithLogger(log, () => handler(ctx));
    } catch (error) {
      return errorResponse(error, log, requestId);
    } finally {
      await flushLogger();
    }
  };
}

function errorResponse(error: unknown, log: Logger, requestId: string): Response {
  if (error instanceof GameError) {
    log.warn({ err: error }, "Admin request rejected");
    return gameErrorResponse(error, requestId);
  }
  if (error instanceof AdminRequestError) {
    log.warn({ err: error }, "Admin request rejected");
    return Response.json({ error: error.message, requestId }, { status: 400 });
  }
  log.error({ err: error }, "Admin request failed");
  const message = error instanceof Error ? formatCatalogError(error) : "Internal server error";
  return Response.json({ error: message, requestId }, { status: 500 });
}
