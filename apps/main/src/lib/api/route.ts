import type { NextRequest } from "next/server";
import type { z } from "zod";
import { resolveGameContext } from "@/lib/games/access";
import { GameError, gameErrorResponse } from "@/lib/games/errors";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { gameIdSchema } from "@/lib/games/schema";
import { requestLogger } from "@/lib/request-logger";
import { parseParams, parseQuery } from "./parse-input";
import type { GameRouteSpec, RouteScope } from "./registry";
import { zodJson } from "./zod-response";

export interface RouteContext {
  params: Promise<Record<string, string | string[]>>;
}

export type GameHandlerContext<Q extends z.ZodObject | undefined, P extends z.ZodObject> = {
  req: NextRequest;
  game: CanonicalGameId;
  params: Omit<z.output<P>, "game">;
  query: Q extends z.ZodObject ? z.output<Q> : undefined;
};

/** A body is answered as the spec's response with `game` added. A Response is answered as is. */
export type GameHandlerResult<R extends z.ZodObject> = Response | Omit<z.input<R>, "game">;

export type GameHandler<Q extends z.ZodObject | undefined, R extends z.ZodObject, P extends z.ZodObject, Extra extends object = object> =
  (ctx: GameHandlerContext<Q, P> & Extra) => Promise<GameHandlerResult<R>>;

const STALE_WHILE_REVALIDATE_SECONDS = 86400;

/** Binds the request logger for a v1 handler and answers an unexpected failure with a JSON 500. */
export async function runApiRequest(req: NextRequest, run: () => Promise<Response>): Promise<Response> {
  const { log } = requestLogger(req, req.nextUrl.pathname.replace(/^\/api\//, ""));
  try {
    return await run();
  } catch (err) {
    log.error({ err }, "API handler error");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Serves a public game route from its spec. Keyed game routes use `defineGameHandler` in `./protect`,
 * which authenticates and meters the request before serving it the same way.
 */
export function definePublicGameHandler<Q extends z.ZodObject | undefined, R extends z.ZodObject, P extends z.ZodObject>(
  spec: GameRouteSpec<Q, R, P, "public">,
  handler: GameHandler<NoInfer<Q>, NoInfer<R>, NoInfer<P>>,
): (req: NextRequest, context: RouteContext) => Promise<Response> {
  const serve = bindGameRoute(spec, handler);
  return (req, context) => runApiRequest(req, () => serve(req, context, {}));
}

/**
 * Parses the game, the path params and the query of a game route, checks that the game offers the spec's
 * capability in the queried region, and answers the handler's body as the spec's response.
 */
export function bindGameRoute<Q extends z.ZodObject | undefined, R extends z.ZodObject, P extends z.ZodObject, S extends RouteScope, Extra extends object>(
  spec: GameRouteSpec<Q, R, P, S>,
  handler: GameHandler<Q, R, P, Extra>,
): (req: NextRequest, context: RouteContext, extra: Extra) => Promise<Response> {
  const ownParams = spec.params.omit({ game: true });
  const cacheHeaders = spec.cacheSeconds === undefined ? undefined : publicCacheHeaders(spec.cacheSeconds);

  return async (req, context, extra) => {
    const raw = await context.params;
    const game = gameIdSchema.safeParse(raw.game);
    if (!game.success) return gameErrorResponse(new GameError("UNKNOWN_GAME", "A canonical game path is required"));
    const params = parseParams(raw, ownParams);
    if (params instanceof Response) return params;
    const query = spec.query && parseQuery(req.nextUrl.searchParams, spec.query);
    if (query instanceof Response) return query;

    try {
      const region = (query as { region?: Region } | undefined)?.region;
      resolveGameContext(game.data, { region, capability: spec.capability });
      const ctx = { ...extra, req, game: game.data, params, query } as GameHandlerContext<Q, P> & Extra;
      const result = await handler(ctx);
      if (!(result instanceof Response)) return zodJson(spec.response, { game: game.data, ...result }, { headers: cacheHeaders });
      if (cacheHeaders && result.status < 400) {
        for (const [name, value] of Object.entries(cacheHeaders)) result.headers.set(name, value);
      }
      return result;
    } catch (error) {
      if (error instanceof GameError) return gameErrorResponse(error);
      throw error;
    }
  };
}

/** Answers 302 to the object a redirect route's spec describes. */
export function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function publicCacheHeaders(seconds: number): Record<string, string> {
  const value = `public, max-age=${seconds}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;
  return { "Cache-Control": value, "CDN-Cache-Control": value, "Vercel-CDN-Cache-Control": value };
}
