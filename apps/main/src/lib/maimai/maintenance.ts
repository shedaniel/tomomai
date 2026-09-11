import type { Region } from "../types";

export function isMaimaiMaintenance(region: Region, date: Date = new Date()): boolean {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hour = jst.getUTCHours();
  if (region === "intl") {
    return hour >= 1 && hour < (jst.getUTCDay() === 3 ? 4 : 2);
  }
  return hour >= 4 && hour < 7;
}
