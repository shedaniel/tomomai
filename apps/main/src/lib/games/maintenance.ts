import type { Region, CanonicalGameId } from "@/lib/games/ids";
import { getGameSite } from "./sites";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

export interface GameMaintenance {
  active: boolean;
  startsAt: Date;
  endsAt: Date;
}

/** The window's bounds as JST wall-clock times ("HH:mm"). */
export function formatMaintenanceWindow(window: GameMaintenance): { start: string; end: string } {
  const time = (date: Date) => new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
  return { start: time(window.startsAt), end: time(window.endsAt) };
}

export function getGameMaintenanceError(window: GameMaintenance): string {
  const { start, end } = formatMaintenanceWindow(window);
  return `Cannot fetch data during maintenance window (${start} - ${end} JST)`;
}

export function getGameMaintenance(game: CanonicalGameId, region: Region, date: Date = new Date()): GameMaintenance | null {
  const schedule = getGameSite(game, region)?.maintenance;
  if (!schedule) return null;

  const now = date.getTime();
  const jst = new Date(now + JST_OFFSET_MS);
  let midnight = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS;
  let weekday = jst.getUTCDay();
  let endHour = schedule.weekdayEndHours?.[weekday] ?? schedule.endHour;
  if (now >= midnight + endHour * HOUR_MS) {
    midnight += DAY_MS;
    weekday = (weekday + 1) % 7;
    endHour = schedule.weekdayEndHours?.[weekday] ?? schedule.endHour;
  }
  const startsAt = new Date(midnight + schedule.startHour * HOUR_MS);
  const endsAt = new Date(midnight + endHour * HOUR_MS);
  return { active: now >= startsAt.getTime() && now < endsAt.getTime(), startsAt, endsAt };
}
