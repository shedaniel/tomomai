/** Puzzle-day boundaries. Each day runs from 00:00 to 24:00 JST. */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Solves this long after the puzzle day ends are kept off public boards. */
export const LATE_VISIBLE_DAYS = 3;

export function isCalendarKey(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

export function dayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

export function dayEnd(dateKey: string): Date {
  return new Date(dayStart(dateKey).getTime() + DAY_MS);
}

/** Last instant a solve still shows on the public board. */
export function visibleUntil(dateKey: string): Date {
  return new Date(dayEnd(dateKey).getTime() + LATE_VISIBLE_DAYS * DAY_MS);
}

export function msSinceDayStart(dateKey: string, at: Date): number {
  return at.getTime() - dayStart(dateKey).getTime();
}

export function isLate(dateKey: string, at: Date): boolean {
  return at.getTime() >= dayEnd(dateKey).getTime();
}

/** `YYYY-MM-DD` shifted by `days` (negative goes back). */
export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toSlug(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}
