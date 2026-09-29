import { createVersionTable, type VersionRow } from "../version-table";

const PRE_SUPERSTAR_INTL_DATE = "2020/11/25";

export const chunithmVersionTable = createVersionTable<VersionRow>([
  { id: -12, name: "CHUNITHM", shortName: "CHUNITHM", aliases: ["無印"], releaseDates: { jp: "2015/07/16", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -11, name: "CHUNITHM PLUS", shortName: "PLUS", releaseDates: { jp: "2016/02/04", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -10, name: "CHUNITHM AIR", shortName: "AIR", releaseDates: { jp: "2016/08/25", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -9, name: "CHUNITHM AIR PLUS", shortName: "AIR+", releaseDates: { jp: "2017/02/09", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -8, name: "CHUNITHM STAR", shortName: "STAR", releaseDates: { jp: "2017/08/24", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -7, name: "CHUNITHM STAR PLUS", shortName: "STAR+", releaseDates: { jp: "2018/03/08", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -6, name: "CHUNITHM AMAZON", shortName: "AMAZON", releaseDates: { jp: "2018/10/25", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -5, name: "CHUNITHM AMAZON PLUS", shortName: "AMAZON+", releaseDates: { jp: "2019/04/11", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -4, name: "CHUNITHM CRYSTAL", shortName: "CRYSTAL", releaseDates: { jp: "2019/10/24", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -3, name: "CHUNITHM CRYSTAL PLUS", shortName: "CRYSTAL+", releaseDates: { jp: "2020/07/16", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -2, name: "CHUNITHM PARADISE", shortName: "PARADISE", releaseDates: { jp: "2021/01/21", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: -1, name: "CHUNITHM PARADISE LOST", shortName: "PARADISE LOST", aliases: ["PARADISE×"], releaseDates: { jp: "2021/05/13", intl: PRE_SUPERSTAR_INTL_DATE } },
  { id: 0, name: "CHUNITHM NEW", shortName: "NEW", releaseDates: { jp: "2021/11/04", intl: "2022/03/03" } },
  { id: 1, name: "CHUNITHM NEW PLUS", shortName: "NEW+", releaseDates: { jp: "2022/04/14", intl: "2022/08/18" } },
  { id: 2, name: "CHUNITHM SUN", shortName: "SUN", releaseDates: { jp: "2022/10/13", intl: "2023/03/02" } },
  { id: 3, name: "CHUNITHM SUN PLUS", shortName: "SUN+", releaseDates: { jp: "2023/05/11", intl: "2023/09/28" } },
  { id: 4, name: "CHUNITHM LUMINOUS", shortName: "LUMINOUS", releaseDates: { jp: "2023/12/14", intl: "2024/03/14" } },
  { id: 5, name: "CHUNITHM LUMINOUS PLUS", shortName: "LUMINOUS+", releaseDates: { jp: "2024/06/20", intl: "2024/10/17" } },
  { id: 6, name: "CHUNITHM VERSE", shortName: "VERSE", releaseDates: { jp: "2024/12/12", intl: "2025/04/17" } },
  { id: 7, name: "CHUNITHM X-VERSE", shortName: "X-VERSE", releaseDates: { jp: "2025/07/16", intl: "2025/11/20" } },
  { id: 8, name: "CHUNITHM X-VERSE-X", shortName: "X-VERSE-X", releaseDates: { jp: "2025/12/11", intl: "2026/04/16" } },
  { id: 9, name: "CHUNITHM Mate", shortName: "Mate", releaseDates: { jp: "2026/07/02" } },
]);
