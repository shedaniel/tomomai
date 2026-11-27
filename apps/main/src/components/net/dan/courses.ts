const KANJI = ["初", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** DX NET's course badge order. The badge file name starts with this index, 00 being no course yet. */
export const DAN_COURSES: readonly string[] = [
  ...KANJI.map(kanji => `${kanji}段`),
  "皆伝",
  ...KANJI.map(kanji => `真${kanji}段`),
  "真皆伝",
  "裏皆伝",
];

/** Index into DAN_COURSES of the badge's course, -1 for no course, null when the url is not a DX NET badge. */
export function danIndexFromBadge(url: string | null): number | null {
  const match = url?.match(/course_rank_(\d{2})/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index < DAN_COURSES.length ? index : null;
}
