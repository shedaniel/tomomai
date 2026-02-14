import { Region } from "@/lib/types";

export const Versions = {
  MAIMAI: {
    id: -13,
    name: "maimai",
    shortName: "maimai",
    intlReleaseDate: "2012/07/11",
    jpReleaseDate: "2012/07/11"
  },
  MAIMAI_PLUS: {
    id: -12,
    name: "maimai PLUS",
    shortName: "maimai PLUS",
    intlReleaseDate: "2012/12/13",
    jpReleaseDate: "2012/12/13"
  },
  MAIMAI_GREEN: {
    id: -11,
    name: "maimai GreeN",
    shortName: "GreeN",
    intlReleaseDate: "2013/07/11",
    jpReleaseDate: "2013/07/11"
  },
  MAIMAI_GREEN_PLUS: {
    id: -10,
    name: "maimai GreeN PLUS",
    shortName: "GreeN PLUS",
    intlReleaseDate: "2014/02/26",
    jpReleaseDate: "2014/02/26"
  },
  MAIMAI_ORANGE: {
    id: -9,
    name: "maimai ORANGE",
    shortName: "ORANGE",
    intlReleaseDate: "2014/09/18",
    jpReleaseDate: "2014/09/18"
  },
  MAIMAI_ORANGE_PLUS: {
    id: -8,
    name: "maimai ORANGE PLUS",
    shortName: "ORANGE PLUS",
    intlReleaseDate: "2015/03/19",
    jpReleaseDate: "2015/03/19"
  },
  MAIMAI_PINK: {
    id: -7,
    name: "maimai PiNK",
    shortName: "PiNK",
    intlReleaseDate: "2015/12/09",
    jpReleaseDate: "2015/12/09"
  },
  MAIMAI_PINK_PLUS: {
    id: -6,
    name: "maimai PiNK PLUS",
    shortName: "PiNK PLUS",
    intlReleaseDate: "2016/06/30",
    jpReleaseDate: "2016/06/30"
  },
  MAIMAI_MURASAKI: {
    id: -5,
    name: "maimai MURASAKi",
    shortName: "MURASAKi",
    intlReleaseDate: "2016/12/15",
    jpReleaseDate: "2016/12/15"
  },
  MAIMAI_MURASAKI_PLUS: {
    id: -4,
    name: "maimai MURASAKi PLUS",
    shortName: "MURASAKi PLUS",
    intlReleaseDate: "2017/06/22",
    jpReleaseDate: "2017/06/22"
  },
  MAIMAI_MILK: {
    id: -3,
    name: "maimai MiLK",
    shortName: "MiLK",
    intlReleaseDate: "2017/12/14",
    jpReleaseDate: "2017/12/14"
  },
  MAIMAI_MILK_PLUS: {
    id: -2,
    name: "maimai MiLK PLUS",
    shortName: "MiLK PLUS",
    intlReleaseDate: "2018/06/21",
    jpReleaseDate: "2018/06/21"
  },
  MAIMAI_FINALE: {
    id: -1,
    name: "maimai FiNALE",
    shortName: "FiNALE",
    intlReleaseDate: "2018/12/13",
    jpReleaseDate: "2018/12/13"
  },
  MAIMAI_DX: {
    id: 0,
    name: "maimai DX",
    shortName: "DX",
    intlReleaseDate: "2019/11/25",
    jpReleaseDate: "2019/07/11"
  },
  MAIMAI_DX_PLUS: {
    id: 1,
    name: "maimai DX PLUS",
    shortName: "DX PLUS",
    intlReleaseDate: "2020/07/29",
    jpReleaseDate: "2020/01/23"
  },
  MAIMAI_DX_SPLASH: {
    id: 2,
    name: "maimai DX スプラッシュ",
    shortName: "Splash",
    intlReleaseDate: "2021/01/29",
    jpReleaseDate: "2020/09/17"
  },
  MAIMAI_DX_SPLASH_PLUS: {
    id: 3,
    name: "maimai DX スプラッシュ PLUS",
    shortName: "Splash PLUS",
    intlReleaseDate: "2021/07/30",
    jpReleaseDate: "2021/03/18"
  },
  MAIMAI_DX_UNIVERSE: {
    id: 4,
    name: "maimai DX UNiVERSE",
    shortName: "UNiVERSE",
    intlReleaseDate: "2022/01/27",
    jpReleaseDate: "2021/09/16"
  },
  MAIMAI_DX_UNIVERSE_PLUS: {
    id: 5,
    name: "maimai DX UNiVERSE PLUS",
    shortName: "UNiVERSE PLUS",
    intlReleaseDate: "2022/07/28",
    jpReleaseDate: "2022/03/24"
  },
  MAIMAI_DX_FESTIVAL: {
    id: 6,
    name: "maimai DX FESTiVAL",
    shortName: "FESTiVAL",
    intlReleaseDate: "2023/01/19",
    jpReleaseDate: "2022/09/15"
  },
  MAIMAI_DX_FESTIVAL_PLUS: {
    id: 7,
    name: "maimai DX FESTiVAL PLUS",
    shortName: "FESTiVAL PLUS",
    intlReleaseDate: "2023/07/27",
    jpReleaseDate: "2023/03/23"
  },
  MAIMAI_DX_BUDDIES: {
    id: 8,
    name: "maimai DX BUDDiES",
    shortName: "BUDDiES",
    intlReleaseDate: "2024/01/18",
    jpReleaseDate: "2023/09/14"
  },
  MAIMAI_DX_BUDDIES_PLUS: {
    id: 9,
    name: "maimai DX BUDDiES PLUS",
    shortName: "BUDDiES PLUS",
    intlReleaseDate: "2024/07/25",
    jpReleaseDate: "2024/03/21"
  },
  MAIMAI_DX_PRISM: {
    id: 10,
    name: "maimai DX PRiSM",
    shortName: "PRiSM",
    intlReleaseDate: "2025/01/16",
    jpReleaseDate: "2024/09/12"
  },
  MAIMAI_DX_PRISM_PLUS: {
    id: 11,
    name: "maimai DX PRiSM PLUS",
    shortName: "PRiSM PLUS",
    intlReleaseDate: "2025/07/24",
    jpReleaseDate: "2025/03/13"
  },
  MAIMAI_DX_CIRCLE: {
    id: 12,
    name: "maimai DX CiRCLE",
    shortName: "CiRCLE",
    intlReleaseDate: "2026/01/22",
    jpReleaseDate: "2025/09/18"
  }
} as const;

export type VersionSlug = keyof typeof Versions;
export type VersionId = typeof Versions[keyof typeof Versions]['id'];

export interface VersionInfo {
  id: VersionId;
  name: string;
  shortName: string;
  intlReleaseDate: string | null; // YYYY/MM/DD format, null if not released yet
  jpReleaseDate: string | null; // YYYY/MM/DD format, null if not released yet
}

export const VERSIONS: VersionInfo[] = Object.values(Versions);

/**
 * Parse date string in YYYY/MM/DD format to Date object.
 * Interprets the date as JST midnight (UTC+9) regardless of server timezone.
 *
 * @param dateString - Date string in YYYY/MM/DD format
 * @returns Date object representing JST midnight of the given date
 *
 * @example
 * parseDate('2025/01/16') // Returns 2025-01-16T00:00:00+09:00
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('/').map(Number);
  // Create ISO 8601 string with JST timezone offset (+09:00)
  // This ensures the date is interpreted as JST midnight regardless of server timezone
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+09:00`);
}

/**
 * Get all available versions for a region (excluding null release dates)
 */
export function getAvailableVersions(region: Region): VersionInfo[] {
  return VERSIONS.filter(v => {
    const dateString = region === "intl" ? v.intlReleaseDate : v.jpReleaseDate;
    return dateString !== null;
  });
}

/**
 * Get the latest available version for a given region
 */
export function getLatestAvailableVersion(region: Region): VersionId {
  const availableVersions = getAvailableVersions(region);
  if (availableVersions.length === 0) {
    throw new Error(`No versions available for region ${region}`);
  }

  // Sort by release date (descending) and return the latest
  const sortedVersions = availableVersions.sort((a, b) => {
    const dateA = parseDate(region === "intl" ? a.intlReleaseDate! : a.jpReleaseDate!);
    const dateB = parseDate(region === "intl" ? b.intlReleaseDate! : b.jpReleaseDate!);
    return dateB.getTime() - dateA.getTime();
  });

  return sortedVersions[0].id;
}

/**
 * Get the version that was current on a specific date for a given region.
 *
 * @param date - Date object representing a point in time. Should be in JST
 *              for correct results (use {@link parseDate} to create JST dates).
 * @param region - Region to check
 * @returns The version ID that was current at the given date
 *
 * @example
 * // Get version for a specific JST date
 * const date = parseDate('2025/01/16');
 * getVersionFromDate(date, 'jp');
 */
export function getVersionFromDate(date: Date, region: Region): VersionId {
  const availableVersions = getAvailableVersions(region);

  // Sort versions by release date for the given region (descending)
  const sortedVersions = availableVersions.sort((a, b) => {
    const dateA = parseDate(region === "intl" ? a.intlReleaseDate! : a.jpReleaseDate!);
    const dateB = parseDate(region === "intl" ? b.intlReleaseDate! : b.jpReleaseDate!);
    return dateB.getTime() - dateA.getTime();
  });

  // Find the latest version that was released on or before the given date
  for (const version of sortedVersions) {
    const releaseDate = parseDate(region === "intl" ? version.intlReleaseDate! : version.jpReleaseDate!);
    if (date >= releaseDate) {
      return version.id;
    }
  }

  // If no version was released before the given date, return the earliest available version
  const earliestVersion = availableVersions.sort((a, b) => {
    const dateA = parseDate(region === "intl" ? a.intlReleaseDate! : a.jpReleaseDate!);
    const dateB = parseDate(region === "intl" ? b.intlReleaseDate! : b.jpReleaseDate!);
    return dateA.getTime() - dateB.getTime();
  })[0];

  return earliestVersion.id;
}

/**
 * Get the current version for a given region based on today's date
 * Falls back to latest available version if current date is beyond all releases
 */
export function getCurrentVersion(region: Region): VersionId {
  try {
    return getVersionFromDate(new Date(), region);
  } catch {
    // Fallback to latest available version
    return getLatestAvailableVersion(region);
  }
}

/**
 * Get version info by version ID
 */
export function getVersionInfo(versionId: VersionId): VersionInfo | null {
  return VERSIONS.find(v => v.id === versionId) || null;
}

/**
 * Get all versions sorted by release date for a specific region
 * Only includes versions that have been released (non-null dates)
 */
export function getVersionsSortedByDate(region: Region, ascending = true): VersionInfo[] {
  const availableVersions = getAvailableVersions(region);
  return availableVersions.sort((a, b) => {
    const dateA = parseDate(region === "intl" ? a.intlReleaseDate! : a.jpReleaseDate!);
    const dateB = parseDate(region === "intl" ? b.intlReleaseDate! : b.jpReleaseDate!);
    return ascending ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
  });
}

/**
 * Check if a version is available at a given date in a region.
 *
 * @param versionId - Version ID to check
 * @param region - Region to check
 * @param date - Date object representing when to check availability.
 *               Defaults to current time. For correct results, use JST dates.
 * @returns Whether the version was available at the given date
 */
export function isVersionAvailable(versionId: VersionId, region: Region, date: Date = new Date()): boolean {
  const version = getVersionInfo(versionId);
  if (!version) return false;

  const dateString = region === "intl" ? version.intlReleaseDate : version.jpReleaseDate;
  if (!dateString) return false; // Not released yet

  const releaseDate = parseDate(dateString);
  return date >= releaseDate;
}
