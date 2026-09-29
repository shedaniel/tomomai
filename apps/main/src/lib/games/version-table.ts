import type { Region } from "./ids";

export type VersionRow = {
  id: number;
  name: string;
  shortName: string;
  aliases?: readonly string[];
  /** YYYY/MM/DD. A region without a date has not released the version, like CN for maimai PLUS versions. */
  releaseDates: Partial<Record<Region, string>>;
};

export type RegionalVersion = Pick<VersionRow, "id" | "name" | "shortName"> & { releaseDate: string };

export type VersionTable<R extends VersionRow = VersionRow> = {
  rows: readonly R[];
  get(id: number): R | null;
  byName(name: string): R | null;
  regional(region: Region, id: number): RegionalVersion | null;
  available(region: Region): RegionalVersion[];
  atDate(region: Region, date: Date, preferredVersion?: number): number;
  current(region: Region, now?: Date): number;
};

/** Versions roll over at 07:00 JST on their release day, independent of regional maintenance. */
export function versionReleaseInstant(releaseDate: string): Date {
  return new Date(`${releaseDate.replaceAll("/", "-")}T07:00:00+09:00`);
}

export function createVersionTable<R extends VersionRow>(rows: readonly R[]): VersionTable<R> {
  const byId = new Map(rows.map(row => [row.id, row]));

  function regional(region: Region, row: R): RegionalVersion | null {
    const releaseDate = row.releaseDates[region];
    return releaseDate ? { id: row.id, name: row.name, shortName: row.shortName, releaseDate } : null;
  }

  function available(region: Region): RegionalVersion[] {
    return rows.flatMap(row => regional(region, row) ?? []);
  }

  function atDate(region: Region, date: Date, preferredVersion?: number): number {
    const sorted = available(region).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id - a.id);
    if (!sorted.length) throw new Error(`No versions available for region ${region}`);
    const released = sorted.find(version => date.getTime() >= versionReleaseInstant(version.releaseDate).getTime());
    if (released && preferredVersion !== undefined) {
      const preferred = sorted.find(version => version.id === preferredVersion && version.releaseDate === released.releaseDate);
      if (preferred) return preferred.id;
    }
    return (released ?? sorted[sorted.length - 1]).id;
  }

  return {
    rows,
    get: id => byId.get(id) ?? null,
    byName(name) {
      const normalized = name.trim().toUpperCase();
      const matches = rows.filter(row => [row.name, row.shortName, ...(row.aliases ?? [])].some(label => label.toUpperCase() === normalized));
      return matches.length === 1 ? matches[0] : null;
    },
    regional(region, id) {
      const row = byId.get(id);
      return row ? regional(region, row) : null;
    },
    available,
    atDate,
    current: (region, now = new Date()) => atDate(region, now),
  };
}
