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
import "@/app/api/v1/me/settings/spec";
import "@/app/api/v1/[game]/songs/spec";
import "@/app/api/v1/[game]/songs/[id]/spec";
import "@/app/api/v1/[game]/snapshots/spec";
import "@/app/api/v1/[game]/snapshots/latest/spec";
import "@/app/api/v1/[game]/snapshots/[id]/spec";
import "@/app/api/v1/[game]/recents/spec";
import "@/app/api/v1/[game]/stats/spec";
import "@/app/api/v1/[game]/albums/spec";
import "@/app/api/v1/[game]/plates/spec";
import "@/app/api/v1/[game]/fetch/spec";
import "@/app/api/v1/[game]/fetch/status/spec";
import "@/app/api/v1/[game]/fetch/token/spec";

export { getRegistry, findRouteBySlug, routeSlug } from "./registry";
export type { RouteSpec } from "./registry";
