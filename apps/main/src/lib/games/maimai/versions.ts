import type { Region } from "../ids";
import { createVersionTable, type VersionRow } from "../version-table";

export const Versions = {
  MAIMAI: { id: -13, name: "maimai", shortName: "maimai", version: 100, releaseDates: { intl: "2012/07/11", jp: "2012/07/11" } },
  MAIMAI_PLUS: { id: -12, name: "maimai PLUS", shortName: "maimai PLUS", version: 110, releaseDates: { intl: "2012/12/13", jp: "2012/12/13" } },
  MAIMAI_GREEN: { id: -11, name: "maimai GreeN", shortName: "GreeN", version: 120, releaseDates: { intl: "2013/07/11", jp: "2013/07/11" } },
  MAIMAI_GREEN_PLUS: { id: -10, name: "maimai GreeN PLUS", shortName: "GreeN PLUS", version: 130, releaseDates: { intl: "2014/02/26", jp: "2014/02/26" } },
  MAIMAI_ORANGE: { id: -9, name: "maimai ORANGE", shortName: "ORANGE", version: 140, releaseDates: { intl: "2014/09/18", jp: "2014/09/18" } },
  MAIMAI_ORANGE_PLUS: { id: -8, name: "maimai ORANGE PLUS", shortName: "ORANGE PLUS", version: 150, releaseDates: { intl: "2015/03/19", jp: "2015/03/19" } },
  MAIMAI_PINK: { id: -7, name: "maimai PiNK", shortName: "PiNK", version: 160, releaseDates: { intl: "2015/12/09", jp: "2015/12/09" } },
  MAIMAI_PINK_PLUS: { id: -6, name: "maimai PiNK PLUS", shortName: "PiNK PLUS", version: 170, releaseDates: { intl: "2016/06/30", jp: "2016/06/30" } },
  MAIMAI_MURASAKI: { id: -5, name: "maimai MURASAKi", shortName: "MURASAKi", version: 180, releaseDates: { intl: "2016/12/15", jp: "2016/12/15" } },
  MAIMAI_MURASAKI_PLUS: { id: -4, name: "maimai MURASAKi PLUS", shortName: "MURASAKi PLUS", version: 185, releaseDates: { intl: "2017/06/22", jp: "2017/06/22" } },
  MAIMAI_MILK: { id: -3, name: "maimai MiLK", shortName: "MiLK", version: 190, releaseDates: { intl: "2017/12/14", jp: "2017/12/14" } },
  MAIMAI_MILK_PLUS: { id: -2, name: "maimai MiLK PLUS", shortName: "MiLK PLUS", version: 195, releaseDates: { intl: "2018/06/21", jp: "2018/06/21" } },
  MAIMAI_FINALE: { id: -1, name: "maimai FiNALE", shortName: "FiNALE", version: 199, releaseDates: { intl: "2018/12/13", jp: "2018/12/13" } },
  MAIMAI_DX: { id: 0, name: "maimai DX", shortName: "DX", version: 200, releaseDates: { intl: "2019/11/25", jp: "2019/07/11", cn: "2019/09/10" } },
  MAIMAI_DX_PLUS: { id: 1, name: "maimai DX PLUS", shortName: "DX PLUS", version: 205, releaseDates: { intl: "2020/07/29", jp: "2020/01/23" } },
  MAIMAI_DX_SPLASH: { id: 2, name: "maimai DX スプラッシュ", shortName: "Splash", version: 210, releaseDates: { intl: "2021/01/29", jp: "2020/09/17", cn: "2021/04/28" } },
  MAIMAI_DX_SPLASH_PLUS: { id: 3, name: "maimai DX スプラッシュ PLUS", shortName: "Splash PLUS", version: 215, releaseDates: { intl: "2021/07/30", jp: "2021/03/18" } },
  MAIMAI_DX_UNIVERSE: { id: 4, name: "maimai DX UNiVERSE", shortName: "UNiVERSE", version: 220, releaseDates: { intl: "2022/01/27", jp: "2021/09/16", cn: "2022/06/23" } },
  MAIMAI_DX_UNIVERSE_PLUS: { id: 5, name: "maimai DX UNiVERSE PLUS", shortName: "UNiVERSE PLUS", version: 225, releaseDates: { intl: "2022/07/28", jp: "2022/03/24" } },
  MAIMAI_DX_FESTIVAL: { id: 6, name: "maimai DX FESTiVAL", shortName: "FESTiVAL", version: 230, releaseDates: { intl: "2023/01/19", jp: "2022/09/15", cn: "2023/06/08" } },
  MAIMAI_DX_FESTIVAL_PLUS: { id: 7, name: "maimai DX FESTiVAL PLUS", shortName: "FESTiVAL PLUS", version: 235, releaseDates: { intl: "2023/07/27", jp: "2023/03/23" } },
  MAIMAI_DX_BUDDIES: { id: 8, name: "maimai DX BUDDiES", shortName: "BUDDiES", version: 240, releaseDates: { intl: "2024/01/18", jp: "2023/09/14", cn: "2024/06/06" } },
  MAIMAI_DX_BUDDIES_PLUS: { id: 9, name: "maimai DX BUDDiES PLUS", shortName: "BUDDiES PLUS", version: 245, releaseDates: { intl: "2024/07/25", jp: "2024/03/21" } },
  MAIMAI_DX_PRISM: { id: 10, name: "maimai DX PRiSM", shortName: "PRiSM", version: 250, releaseDates: { intl: "2025/01/16", jp: "2024/09/12", cn: "2025/06/11" } },
  MAIMAI_DX_PRISM_PLUS: { id: 11, name: "maimai DX PRiSM PLUS", shortName: "PRiSM PLUS", version: 255, releaseDates: { intl: "2025/07/24", jp: "2025/03/13", cn: "2026/06/10" } },
  MAIMAI_DX_CIRCLE: { id: 12, name: "maimai DX CiRCLE", shortName: "CiRCLE", version: 260, releaseDates: { intl: "2026/01/22", jp: "2025/09/18" } },
  MAIMAI_DX_CIRCLE_PLUS: { id: 13, name: "maimai DX CiRCLE PLUS", shortName: "CiRCLE PLUS", version: 265, releaseDates: { intl: "2026/07/23", jp: "2026/03/19" } },
  MAIMAI_DX_MAGICAL: { id: 14, name: "maimai DX MAGiCAL", shortName: "MAGiCAL", version: 270, releaseDates: { jp: "2026/09/17" } },
} as const satisfies Record<string, VersionRow & { version: number }>;

export type VersionId = typeof Versions[keyof typeof Versions]["id"];
export type VersionInfo = VersionRow & { id: VersionId; version: number };

export const maimaiVersionTable = createVersionTable<VersionInfo>(Object.values(Versions));

export function getVersionByShortName(shortName: string): VersionInfo | undefined {
  return maimaiVersionTable.rows.find(version => version.shortName === shortName);
}

/** Five-digit codes resolve by their first three digits to the latest version at or below them, so 19995 is FiNALE (199). */
export function getVersionByShortCode(shortCode: string): VersionInfo | undefined {
  if (shortCode.length !== 5) return undefined;
  const versionNum = parseInt(shortCode.slice(0, 3), 10);
  if (isNaN(versionNum)) return undefined;

  let best: VersionInfo | undefined;
  for (const v of maimaiVersionTable.rows) {
    if (v.version <= versionNum && (!best || v.version > best.version)) {
      best = v;
    }
  }
  return best;
}

export function requireMaimaiVersion(version: number): VersionId {
  const info = maimaiVersionTable.get(version);
  if (!info) throw new Error(`Unknown maimai version: ${version}`);
  return info.id;
}

export function maimaiVersionAt(region: Region, date: Date): VersionId {
  return requireMaimaiVersion(maimaiVersionTable.atDate(region, date));
}
