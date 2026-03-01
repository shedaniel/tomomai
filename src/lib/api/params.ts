import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

/**
 * Parse and validate the `?region=` search param.
 * Returns either a valid Region or a 400 JSON Response.
 */
export function parseRegion(searchParams: URLSearchParams): Region | Response {
  const raw = searchParams.get("region");
  const enabled = getEnabledRegions();
  if (!raw || !enabled.includes(raw as Region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabled.join(", ")}` },
      { status: 400 },
    );
  }
  return raw as Region;
}

/**
 * Parse `?limit=` and `?offset=` with defaults and clamping.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 50,
  maxLimit = 100,
): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}
