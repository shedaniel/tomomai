import { offersCapability } from "@/lib/games/capabilities";
import { CANONICAL_GAME_IDS, type CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import type { GameCapability } from "@/lib/games/types";
import { z } from "zod";
import type { ScopeKey } from "./scopes";

/** Required scope(s). `"public"` means no auth at all. Multiple scopes are AND-ed. */
export type RouteScope = ScopeKey | ScopeKey[] | "public";

/** A refusal the route answers with a stable error `code`, beyond the errors every route shares. */
export interface RouteErrorResponse {
  status: number;
  code: string;
  description: string;
  /** The response carries `Retry-After` in seconds. */
  retryAfter?: true;
}

/**
 * A single Developer Center route entry. Routes register themselves via
 * `defineRoute(...)` at module load. The registry is the single source of
 * truth for /developer docs and the generated OpenAPI document.
 */
export interface RouteSpec<
  Q extends z.ZodObject | undefined = z.ZodObject | undefined,
  R extends z.ZodType = z.ZodType,
  P extends z.ZodObject | undefined = z.ZodObject | undefined,
  S extends RouteScope = RouteScope,
> {
  /** HTTP method. */
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  /** Full path including the `/api/v1` prefix. */
  path: string;
  /** Short tag used for grouping in the docs sidebar. */
  tag: string;
  /** One-line summary (sentence case, no trailing period). */
  summary: string;
  /** Longer markdown description rendered on the endpoint page. */
  description?: string;
  scope: S;
  /**
   * Optional scopes that unlock extra fields when present. Documented but
   * never required.
   */
  optionalScopes?: { scope: ScopeKey; effect: string }[];
  /** Zod schema for `?key=value` search params. */
  query?: Q;
  /** Zod schema for path params (e.g. `:id`). */
  params?: P;
  /** Zod schema for the successful (2xx) JSON response body. */
  response: R;
  /** Inline examples for the docs page. */
  examples?: {
    name: string;
    query?: Record<string, string | number>;
    response: unknown;
  }[];
  /** Route-specific refusals, documented in the docs and the OpenAPI document. */
  errors?: readonly RouteErrorResponse[];
  /** If true, renders a `Deprecated` badge in the docs. */
  deprecated?: boolean;
  /** Successful responses of a public route carry CDN cache headers for this many seconds. */
  cacheSeconds?: number;
  /** Cost units consumed per call. See the Rate Limits guide. */
  cost: number;
  /** If true, route is omitted from the public OpenAPI document. Use for
   *  first-party/internal-scope routes that should not be advertised. */
  internal?: boolean;
}

/** A route under `/api/v1/games/{game}`, served only for games that offer its capability. */
export interface GameRouteSpec<
  Q extends z.ZodObject | undefined = z.ZodObject | undefined,
  R extends z.ZodObject = z.ZodObject,
  P extends z.ZodObject = z.ZodObject,
  S extends RouteScope = RouteScope,
> extends RouteSpec<Q, R, P, S> {
  params: P;
  capability: GameCapability;
  /** The route answers 302 to the published object that `response` describes. */
  redirect?: boolean;
}

type GameField = z.ZodEnum<{ [G in CanonicalGameId]: G }>;
type WithGame<T extends z.ZodObject> = z.ZodObject<T["shape"] & { game: GameField }>;
type OwnParams<P extends z.ZodObject | undefined> = P extends z.ZodObject ? P : z.ZodObject<Record<never, never>>;

/** A game route as its spec module declares it, before `game` is added to its params and response. */
export type GameRouteDefinition<
  Q extends z.ZodObject | undefined,
  R extends z.ZodObject,
  P extends z.ZodObject | undefined,
  S extends RouteScope,
> = Omit<GameRouteSpec<Q, R, OwnParams<P>, S>, "params"> & { params?: P };

const REGISTRY = new Map<string, RouteSpec>();

export function defineRoute<
  R extends z.ZodType,
  S extends RouteScope,
  Q extends z.ZodObject | undefined = undefined,
  P extends z.ZodObject | undefined = undefined,
>(spec: RouteSpec<Q, R, P, S>): RouteSpec<Q, R, P, S> {
  if (spec.cacheSeconds !== undefined && spec.scope !== "public") {
    throw new Error(`${spec.method} ${spec.path} answers per-user data and cannot be publicly cached`);
  }
  // Hot reload re-registers a module, so the last definition wins.
  REGISTRY.set(`${spec.method} ${spec.path}`, spec as unknown as RouteSpec);
  return spec;
}

/**
 * Registers a game route. Its `game` path param and response field list only the games that offer the
 * route's capability, so the docs and the OpenAPI document show where the route is served.
 */
export function defineGameRoute<
  R extends z.ZodObject,
  S extends RouteScope,
  Q extends z.ZodObject | undefined = undefined,
  P extends z.ZodObject | undefined = undefined,
>(spec: GameRouteDefinition<Q, R, P, S>): GameRouteSpec<Q, WithGame<R>, WithGame<OwnParams<P>>, S> {
  const games = CANONICAL_GAME_IDS.filter(id => offersCapability(getGame(id), spec.capability));
  if (games.length === 0) throw new Error(`${spec.method} ${spec.path}: no game offers ${spec.capability}`);
  const game: GameField = z.enum(games).describe("Canonical game ID. Only games that offer this route are listed.");
  const registered = {
    ...spec,
    params: z.object({ game }).extend(spec.params?.shape ?? {}),
    response: spec.response.extend({ game }),
  } as unknown as GameRouteSpec<Q, WithGame<R>, WithGame<OwnParams<P>>, S>;
  defineRoute(registered);
  return registered;
}

export function isGameRoute(spec: RouteSpec): spec is GameRouteSpec {
  return "capability" in spec;
}

export function requiredScopes(spec: RouteSpec): ScopeKey[] {
  if (spec.scope === "public") return [];
  return Array.isArray(spec.scope) ? spec.scope : [spec.scope];
}

/** Every documented route as "METHOD /path", under each scope it requires. */
export function routesByScope(): Partial<Record<ScopeKey, string[]>> {
  const routes: Partial<Record<ScopeKey, string[]>> = {};
  for (const route of getRegistry()) {
    for (const scope of requiredScopes(route)) (routes[scope] ??= []).push(`${route.method} ${route.path}`);
  }
  return routes;
}

/** Returns all registered route specs, sorted by tag then path.
 *  Internal routes (RouteSpec.internal === true) are excluded — they don't
 *  appear in the public developer reference or OpenAPI doc. */
export function getRegistry(): RouteSpec[] {
  return Array.from(REGISTRY.values())
    .filter((r) => !r.internal)
    .sort((a, b) => {
      if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
      return a.path.localeCompare(b.path);
    });
}

/**
 * Find a route by its slug as used in the docs URL.
 * Slug rules: lowercase, `:param` → `param`, `/` → `-`, strip leading `/api-v1-`.
 * Example: `GET /api/v1/snapshots/:id` → `snapshots-id`.
 */
export function findRouteBySlug(slug: string): RouteSpec | undefined {
  return getRegistry().find((r) => routeSlug(r) === slug);
}

export function routeSlug(spec: RouteSpec): string {
  const path = spec.path
    .replace(/^\/api\/v1\/?/, "")
    .replace(/\{(\w+)\}/g, "$1")
    .replace(/:/g, "")
    .replace(/\//g, "-");
  return `${spec.method.toLowerCase()}-${path || "root"}`;
}
