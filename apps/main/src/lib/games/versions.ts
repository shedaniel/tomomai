import {
  getAvailableVersions as getAvailableMaimaiVersions,
  getCurrentVersion as getCurrentMaimaiVersion,
  getVersionInfo as getMaimaiVersionInfo,
} from "@/lib/metadata";
import type { Region } from "@/lib/types";
import type { CanonicalGameId, GameVersionInfo, VersionProvider } from "./types";

type ChunithmVersion = Omit<GameVersionInfo, "releaseDate"> & {
  jpReleaseDate: string;
  intlReleaseDate: string | null;
};

const PRE_SUPERSTAR_INTL_DATE = "2020/11/25";

export const ChunithmVersions = {
  CHUNITHM: { id: -12, name: "CHUNITHM", shortName: "CHUNITHM", jpReleaseDate: "2015/07/16", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_PLUS: { id: -11, name: "CHUNITHM PLUS", shortName: "PLUS", jpReleaseDate: "2016/02/04", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_AIR: { id: -10, name: "CHUNITHM AIR", shortName: "AIR", jpReleaseDate: "2016/08/25", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_AIR_PLUS: { id: -9, name: "CHUNITHM AIR PLUS", shortName: "AIR+", jpReleaseDate: "2017/02/09", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_STAR: { id: -8, name: "CHUNITHM STAR", shortName: "STAR", jpReleaseDate: "2017/08/24", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_STAR_PLUS: { id: -7, name: "CHUNITHM STAR PLUS", shortName: "STAR+", jpReleaseDate: "2018/03/08", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_AMAZON: { id: -6, name: "CHUNITHM AMAZON", shortName: "AMAZON", jpReleaseDate: "2018/10/25", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_AMAZON_PLUS: { id: -5, name: "CHUNITHM AMAZON PLUS", shortName: "AMAZON+", jpReleaseDate: "2019/04/11", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_CRYSTAL: { id: -4, name: "CHUNITHM CRYSTAL", shortName: "CRYSTAL", jpReleaseDate: "2019/10/24", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_CRYSTAL_PLUS: { id: -3, name: "CHUNITHM CRYSTAL PLUS", shortName: "CRYSTAL+", jpReleaseDate: "2020/07/16", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_PARADISE: { id: -2, name: "CHUNITHM PARADISE", shortName: "PARADISE", jpReleaseDate: "2021/01/21", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_PARADISE_LOST: { id: -1, name: "CHUNITHM PARADISE LOST", shortName: "PARADISE LOST", jpReleaseDate: "2021/05/13", intlReleaseDate: PRE_SUPERSTAR_INTL_DATE },
  CHUNITHM_NEW: { id: 0, name: "CHUNITHM NEW", shortName: "NEW", jpReleaseDate: "2021/11/04", intlReleaseDate: "2022/03/03" },
  CHUNITHM_NEW_PLUS: { id: 1, name: "CHUNITHM NEW PLUS", shortName: "NEW+", jpReleaseDate: "2022/04/14", intlReleaseDate: "2022/08/18" },
  CHUNITHM_SUN: { id: 2, name: "CHUNITHM SUN", shortName: "SUN", jpReleaseDate: "2022/10/13", intlReleaseDate: "2023/03/02" },
  CHUNITHM_SUN_PLUS: { id: 3, name: "CHUNITHM SUN PLUS", shortName: "SUN+", jpReleaseDate: "2023/05/11", intlReleaseDate: "2023/09/28" },
  CHUNITHM_LUMINOUS: { id: 4, name: "CHUNITHM LUMINOUS", shortName: "LUMINOUS", jpReleaseDate: "2023/12/14", intlReleaseDate: "2024/03/14" },
  CHUNITHM_LUMINOUS_PLUS: { id: 5, name: "CHUNITHM LUMINOUS PLUS", shortName: "LUMINOUS+", jpReleaseDate: "2024/06/20", intlReleaseDate: "2024/10/17" },
  CHUNITHM_VERSE: { id: 6, name: "CHUNITHM VERSE", shortName: "VERSE", jpReleaseDate: "2024/12/12", intlReleaseDate: "2025/04/17" },
  CHUNITHM_X_VERSE: { id: 7, name: "CHUNITHM X-VERSE", shortName: "X-VERSE", jpReleaseDate: "2025/07/16", intlReleaseDate: "2025/11/20" },
  CHUNITHM_X_VERSE_X: { id: 8, name: "CHUNITHM X-VERSE-X", shortName: "X-VERSE-X", jpReleaseDate: "2025/12/11", intlReleaseDate: "2026/04/16" },
  CHUNITHM_MATE: { id: 9, name: "CHUNITHM Mate", shortName: "Mate", jpReleaseDate: "2026/07/02", intlReleaseDate: null },
} as const satisfies Record<string, ChunithmVersion>;

export const CHUNITHM_VERSIONS: readonly ChunithmVersion[] = Object.values(ChunithmVersions);

function getChunithmReleaseDate(version: ChunithmVersion, region: Region): string | null {
  if (region === "jp") return version.jpReleaseDate;
  if (region === "intl") return version.intlReleaseDate;
  return null;
}

function maimaiReleaseDate(info: NonNullable<ReturnType<typeof getMaimaiVersionInfo>>, region: Region): string | null {
  if (region === "jp") return info.jpReleaseDate;
  if (region === "intl") return info.intlReleaseDate;
  return info.cnReleaseDate;
}

export const maimaiVersionProvider: VersionProvider = {
  getCurrentVersion: getCurrentMaimaiVersion,
  getVersionInfo(region, version) {
    const info = getMaimaiVersionInfo(version as Parameters<typeof getMaimaiVersionInfo>[0]);
    if (!info) return null;
    const releaseDate = maimaiReleaseDate(info, region);
    return releaseDate ? { id: info.id, name: info.name, shortName: info.shortName, releaseDate } : null;
  },
};

export const chunithmVersionProvider: VersionProvider = {
  getCurrentVersion(region) {
    const versions = CHUNITHM_VERSIONS.filter(version => getChunithmReleaseDate(version, region) !== null);
    if (versions.length === 0) {
      throw new Error(`No CHUNITHM versions available for region ${region}`);
    }
    return versions.at(-1)!.id;
  },
  getVersionInfo(region, version) {
    const info = CHUNITHM_VERSIONS.find(candidate => candidate.id === version);
    if (!info) return null;
    const releaseDate = getChunithmReleaseDate(info, region);
    return releaseDate ? { id: info.id, name: info.name, shortName: info.shortName, releaseDate } : null;
  },
};

const VERSION_PROVIDERS: Record<CanonicalGameId, VersionProvider> = {
  maimai: maimaiVersionProvider,
  chunithm: chunithmVersionProvider,
};

export function getCurrentVersion(game: CanonicalGameId, region: Region): number {
  return VERSION_PROVIDERS[game].getCurrentVersion(region);
}

export function getVersionInfo(game: CanonicalGameId, region: Region, version: number): GameVersionInfo | null {
  return VERSION_PROVIDERS[game].getVersionInfo(region, version);
}

export function getAvailableVersions(game: CanonicalGameId, region: Region): GameVersionInfo[] {
  const ids = game === "maimai"
    ? getAvailableMaimaiVersions(region).map(version => version.id)
    : CHUNITHM_VERSIONS.map(version => version.id);
  return ids.flatMap(id => {
    const info = getVersionInfo(game, region, id);
    return info ? [info] : [];
  });
}
