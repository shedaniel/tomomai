import { parsePastDateSlug } from "./date-slug";

/**
 * Pulls a `?date=YYYYMMDD` query parameter off a route request and validates
 * it as a past JST date.
 *
 * Returns:
 *   - `string` — a canonical `YYYY-MM-DD` dateKey to pass to `getToday()`.
 *   - `null`   — no `date` query was present; the caller should fall back to
 *                today (server `getDateKey()`).
 *   - `"invalid"` — the `date` query was malformed, debug-prefixed, future or
 *                   referred to today. The route should reject (404).
 */
export function readDateOverride(req: Request): string | null | "invalid" {
  const slug = new URL(req.url).searchParams.get("date");
  if (!slug) return null;
  const dateKey = parsePastDateSlug(slug);
  return dateKey ?? "invalid";
}
