/**
 * JST date + URL-slug helpers. The puzzle pivots on Asia/Tokyo midnight, so
 * every date-related decision (today's key, past-date validation, sitemap,
 * display formatting) shares this module to avoid `Intl.DateTimeFormat` drift.
 */

const JST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's date key in Asia/Tokyo, formatted YYYY-MM-DD. When DEBUG_KEY is set
 * (server-side env only), returns `debug-<value>` so we can pin a stable day
 * during development.
 */
export function getDateKey(now: Date = new Date()): string {
  const dbg = process.env.DEBUG_KEY;
  if (dbg) return `debug-${dbg}`;
  return JST_FMT.format(now);
}

/** Real JST today, ignoring DEBUG_KEY — for past-date comparison only. */
export function getRealTodayKey(now: Date = new Date()): string {
  return JST_FMT.format(now);
}

/**
 * Given a URL slug like `"20260520"`, return a canonical `YYYY-MM-DD` dateKey
 * if it refers to a *past* JST date. Returns `null` for: malformed slugs,
 * debug-prefixed slugs, future dates, today, and impossible dates.
 */
export function parsePastDateSlug(slug: string): string | null {
  if (!/^\d{8}$/.test(slug)) return null;
  const dateKey = `${slug.slice(0, 4)}-${slug.slice(4, 6)}-${slug.slice(6, 8)}`;
  if (dateKey >= getRealTodayKey()) return null;
  const dt = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  if (JST_FMT.format(dt) !== dateKey) return null;
  return dateKey;
}

/** Is the given 8-digit slug equal to real JST today? */
export function isTodaySlug(slug: string): boolean {
  if (!/^\d{8}$/.test(slug)) return false;
  const dateKey = `${slug.slice(0, 4)}-${slug.slice(4, 6)}-${slug.slice(6, 8)}`;
  return dateKey === getRealTodayKey();
}

/** YYYYMMDD slug for the JST date `daysBack` days before today. */
export function previousJstDateSlug(daysBack: number): string {
  const base = new Date(`${getRealTodayKey()}T00:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() - daysBack);
  return JST_FMT.format(base).replace(/-/g, "");
}

/** Format a YYYY-MM-DD dateKey for human display in the given locale. */
export function formatDateKey(dateKey: string, locale: string): string {
  const dt = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return dateKey;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(dt);
  } catch {
    return dateKey;
  }
}
