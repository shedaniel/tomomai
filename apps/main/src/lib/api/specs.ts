/**
 * Barrel import that eagerly loads every route's spec module so the registry
 * in `./registry.ts` is fully populated whenever any consumer touches it
 * (the route handler, the OpenAPI generator, or the /developer docs page).
 *
 * Add new routes by exporting a `spec` const from a colocated `spec.ts` file
 * and importing that module here.
 */
import "@/app/api/v1/ok/spec";
import "@/app/api/v1/me/spec";
import "@/app/api/v1/me/scopes/spec";
import "@/app/api/v1/games/[game]/codes/spec";
import "@/app/api/v1/games/[game]/songs/spec";
import "@/app/api/v1/games/[game]/parents/spec";
import "@/app/api/v1/games/[game]/songs/versions/spec";
import "@/app/api/v1/games/[game]/songs/[id]/spec";
import "@/app/api/v1/games/[game]/snapshots/spec";
import "@/app/api/v1/games/[game]/snapshots/latest/spec";
import "@/app/api/v1/games/[game]/snapshots/[id]/spec";
import "@/app/api/v1/games/[game]/recents/spec";
import "@/app/api/v1/games/[game]/stats/spec";
import "@/app/api/v1/games/[game]/albums/spec";
import "@/app/api/v1/games/[game]/plates/spec";
import "@/app/api/v1/me/settings/spec";
import "@/app/api/v1/games/[game]/fetch/spec";
import "@/app/api/v1/games/[game]/fetch/status/spec";
import "@/app/api/v1/games/[game]/fetch/token/spec";

export { getRegistry, findRouteBySlug, requiredScopes, routeSlug, routesByScope } from "./registry";
export type { RouteSpec } from "./registry";
