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
import "@/app/api/v1/songs/spec";
import "@/app/api/v1/songs/[id]/spec";
import "@/app/api/v1/snapshots/spec";
import "@/app/api/v1/snapshots/latest/spec";
import "@/app/api/v1/snapshots/[id]/spec";
import "@/app/api/v1/recents/spec";
import "@/app/api/v1/stats/spec";
import "@/app/api/v1/albums/spec";
import "@/app/api/v1/plates/spec";
import "@/app/api/v1/me/settings/spec";
import "@/app/api/v1/fetch/spec";
import "@/app/api/v1/fetch/status/spec";
import "@/app/api/v1/fetch/token/spec";

export { getRegistry, findRouteBySlug, routeSlug } from "./registry";
export type { RouteSpec } from "./registry";
