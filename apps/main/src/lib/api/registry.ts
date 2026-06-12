import { z } from "zod";
import type { ScopeKey } from "./scopes";

/**
 * A single Developer Center route entry. Routes register themselves via
 * `defineRoute(...)` at module load. The registry is the single source of
 * truth for /developer docs and the generated OpenAPI document.
 */
export interface RouteSpec<
  Q extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
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
  /**
   * Required scope(s). `"public"` means no auth at all.
   * Multiple scopes are AND-ed.
   */
  scope: ScopeKey | ScopeKey[] | "public";
  /**
   * Optional scopes that unlock extra fields when present. Documented but
   * never required.
   */
  optionalScopes?: { scope: ScopeKey; effect: string }[];
  /** Zod schema for `?key=value` search params. */
  query?: Q;
  /** Zod schema for path params (e.g. `:id`). */
  params?: z.ZodTypeAny;
  /** Zod schema for the successful (2xx) JSON response body. */
  response: R;
  /** Inline examples for the docs page. */
  examples?: {
    name: string;
    query?: Record<string, string | number>;
    response: unknown;
  }[];
  /** If true, renders a `Deprecated` badge in the docs. */
  deprecated?: boolean;
  /** If true, the response is cached server-side for the given seconds. */
  cacheSeconds?: number;
  /** Cost units consumed per call. See the Rate Limits guide. */
  cost: number;
  /** If true, route is omitted from the public OpenAPI document. Use for
   *  first-party/internal-scope routes that should not be advertised. */
  internal?: boolean;
}

const REGISTRY = new Map<string, RouteSpec>();

export function defineRoute<
  Q extends z.ZodTypeAny,
  R extends z.ZodTypeAny,
>(spec: RouteSpec<Q, R>): RouteSpec<Q, R> {
  const key = `${spec.method} ${spec.path}`;
  if (REGISTRY.has(key) && process.env.NODE_ENV !== "production") {
    // Don't crash on hot reload — last definition wins.
    REGISTRY.set(key, spec as unknown as RouteSpec);
  } else {
    REGISTRY.set(key, spec as unknown as RouteSpec);
  }
  return spec;
}

/** Returns all registered route specs, sorted by tag then path.
 *  Internal routes (RouteSpec.internal === true) are excluded — they don't
 *  appear in the public developer reference or OpenAPI doc. Internal lookups
 *  (e.g. by withApiKey via findRouteByRequest) still see every route. */
export function getRegistry(): RouteSpec[] {
  return Array.from(REGISTRY.values())
    .filter((r) => !r.internal)
    .sort((a, b) => {
      if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
      return a.path.localeCompare(b.path);
    });
}

/** Look up a single spec by `METHOD path` or by slugified path. */
export function findRoute(method: string, path: string): RouteSpec | undefined {
  return REGISTRY.get(`${method.toUpperCase()} ${path}`);
}

/**
 * Match a concrete request (method + pathname) against the registered spec
 * templates. Templates use `{param}` placeholders (e.g. `/api/v1/{game}/snapshots/{id}`).
 */
export function findRouteByRequest(method: string, pathname: string): RouteSpec | undefined {
  const upperMethod = method.toUpperCase();
  for (const spec of REGISTRY.values()) {
    if (spec.method !== upperMethod) continue;
    if (matchTemplate(spec.path, pathname)) return spec;
  }
  return undefined;
}

function matchTemplate(template: string, pathname: string): boolean {
  const regex = new RegExp(
    "^" +
      template
        .replace(/[.+?^$()|[\]\\]/g, "\\$&")
        .replace(/\{(\w+)\}/g, "[^/]+") +
      "/?$",
  );
  return regex.test(pathname);
}

/**
 * Find a route by its slug as used in the docs URL.
 * Slug rules: lowercase, `:param` → `param`, `/` → `-`, strip leading `/api-v1-`.
 * Example: `GET /api/v1/{game}/snapshots/{id}` → `get-game-snapshots-id`.
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
