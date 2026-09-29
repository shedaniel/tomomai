import { versionReleaseInstant } from "@/lib/games/version-table";

export const OTOGE_DB_RAW_ROOT = "https://raw.githubusercontent.com/zvuc/otoge-db/main";

export function otogeDbUrl(path: string): string {
  return `${OTOGE_DB_RAW_ROOT}/${path}`;
}

/** Reads a `YYYYMMDD` date. A chart added on a release day belongs to the version released that day. */
export function parseOtogeDbDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = versionReleaseInstant(`${year}/${month}/${day}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Reads a chart constant such as `12.6` as a constant ×10. otoge-db writes `-` or nothing when it is unknown. */
export function parseOtogeDbConstant(value: string | undefined): number | undefined {
  const constant = value ? parseFloat(value) : NaN;
  return Number.isFinite(constant) ? Math.round(constant * 10) : undefined;
}
