/**
 * Single source of truth for `/api/*` URL construction on the client.
 *
 * The past-date `?date=<slug>` query has to thread through every API call on
 * `/[date]` so the server resolves the same chart we're showing. Building
 * those URLs inline was easy to get wrong (mixing `?` and `&`), so all
 * callers go through these helpers.
 */

function dateQuery(dateSlug?: string, leadChar: "?" | "&" = "?"): string {
  if (!dateSlug) return "";
  return `${leadChar}date=${encodeURIComponent(dateSlug)}`;
}

export function buildTodayUrl(dateSlug?: string): string {
  return `/api/today${dateQuery(dateSlug)}`;
}

export function buildChartUrl(step: number, dateSlug?: string): string {
  return `/api/chart/${step}${dateQuery(dateSlug)}`;
}

export function buildImageUrl(
  step: number,
  dateKey: string,
  dateSlug?: string,
): string {
  return `/api/chart/${step}/image?d=${encodeURIComponent(dateKey)}${dateQuery(dateSlug, "&")}`;
}

export function buildSubmitUrl(dateSlug?: string): string {
  return `/api/submit${dateQuery(dateSlug)}`;
}
