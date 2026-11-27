/** Today as DX NET prints its ranking update stamp, "2026/11/20". Always today, the ranking never misses a night. */
export function netUpdateDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
}
