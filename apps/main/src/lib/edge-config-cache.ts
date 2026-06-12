import { get } from "@vercel/edge-config";

/**
 * Edge Config is billed per read, and our hot paths read it on essentially
 * every request: the middleware checks `maintenanceMode` on every non-static
 * request and the root layout reads `preMaintenanceMode` on every render. At
 * traffic, that's millions of reads for values that change a few times a year.
 *
 * This wraps `get()` in a tiny per-instance TTL cache. A warm serverless /
 * edge instance reuses the cached value within the window instead of issuing
 * a fresh read on every invocation, collapsing the read count from
 * per-request to roughly per-instance-per-TTL.
 *
 * The cache is intentionally per-instance (module scope): there is no shared
 * store, so the worst case is one read per cold instance per TTL. Values like
 * maintenance flags are "break glass" toggles where a sub-minute propagation
 * delay is fine.
 */

const DEFAULT_TTL_MS = 30_000;

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();

/**
 * Read an Edge Config key through a short-lived in-memory cache. Errors from
 * the underlying `get()` propagate unchanged so callers keep their own
 * fallback handling (e.g. "edge config unavailable, continue normally").
 *
 * `undefined`/absent values are cached too — that's the common hot path
 * (maintenance off), and it's exactly what we want to stop re-reading.
 */
export async function getCachedEdgeConfig<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T | undefined> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    return hit.value as T | undefined;
  }

  const value = await get<T>(key);
  cache.set(key, { value, expires: now + ttlMs });
  return value;
}
