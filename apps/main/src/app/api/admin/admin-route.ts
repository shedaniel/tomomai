import "server-only";
import type { NextRequest } from "next/server";
import { checkAdminToken, type AdminTokenCheck } from "@/lib/admin-token";
import { GameError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId } from "@/lib/games/ids";
import { logger } from "@/lib/logger";
import { withLogContext, withRequestLogContext } from "@/lib/request-logger";
import { AdminRequestError, resolveAdminGame } from "@/server/services/catalog/admin-game";
import { formatCatalogError } from "@/server/services/catalog/errors";

type RouteParams = Record<string, string>;

type AdminRouteContext<P extends RouteParams> = {
  request: NextRequest;
  requestId: string;
  params: P;
};

type AdminGameRouteContext<P extends RouteParams> = AdminRouteContext<P> & { game: CanonicalGameId };

type AdminRouteHandler<P extends RouteParams> = (request: NextRequest, context?: { params?: Promise<P> }) => Promise<Response>;

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
 * Serves an admin route under its request log context: checks the admin bearer token, resolves `?game=`
 * when the route declares game access and adds it to the log context, and answers rejections and
 * failures as JSON with the request id.
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
  const serve = withRequestLogContext<{ params?: Promise<P> }>(name, async (request, { params: routeParams, requestId }) => {
    try {
      if (options.auth !== "none") {
        const check = checkAdminToken(request.headers.get("authorization"));
        if (check !== "ok") {
          if (check === "unconfigured") logger.error("ADMIN_UPDATE_TOKEN environment variable not set");
          if (check === "invalid") logger.warn("Invalid admin token attempt");
          const { status, error } = TOKEN_REJECTIONS[check];
          return Response.json({ error, requestId }, { status });
        }
      }
      const params = ((await routeParams) ?? {}) as P;
      // The overloads only pair a handler that reads `game` with a route that resolves it.
      if (!options.game) return await handler({ request, requestId, params } as AdminGameRouteContext<P>);

      const game = resolveAdminGame(request.nextUrl.searchParams, { write: options.game === "write" });
      return await withLogContext({ game }, () => handler({ request, requestId, params, game }));
    } catch (error) {
      return errorResponse(error, requestId);
    }
  });
  return (request, context = {}) => serve(request, context);
}

function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof GameError) {
    logger.warn({ err: error }, "Admin request rejected");
    return gameErrorResponse(error, requestId);
  }
  if (error instanceof AdminRequestError) {
    logger.warn({ err: error }, "Admin request rejected");
    return Response.json({ error: error.message, requestId }, { status: 400 });
  }
  logger.error({ err: error }, "Admin request failed");
  const message = error instanceof Error ? formatCatalogError(error) : "Internal server error";
  return Response.json({ error: message, requestId }, { status: 500 });
}
