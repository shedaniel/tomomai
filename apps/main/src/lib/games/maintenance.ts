import type { Region } from "@/lib/types";
import type { CanonicalGameId } from "./types";
import { getGameSite } from "./sites";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

export interface GameMaintenance {
  active: boolean;
  startsAt: Date;
  endsAt: Date;
}

export function getGameMaintenanceError(window: GameMaintenance): string {
  const time = (date: Date) => new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
  return `Cannot fetch data during maintenance window (${time(window.startsAt)} - ${time(window.endsAt)} JST)`;
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
