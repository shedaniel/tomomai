import type { Chart, Hint, Reveal } from "./types";
import { TOTAL_STEPS } from "./types";
import { buildStepPlan, getDateKey, pickDailyChart } from "./daily";
import { getSongPool } from "./song-pool";
import { HINTS } from "./hints-registry";

export type Today = {
  dateKey: string;
  chart: Chart;
  plan: Hint[]; // length TOTAL_STEPS - 1 (last step is reveal)
};

/**
 * Today's chart + plan. With no override, uses `getDateKey()` (JST today or
 * the DEBUG_KEY override). Pass a `YYYY-MM-DD` `dateOverride` to compute the
 * plan for a past date instead — used by the `/[date]` route. Pure function
 * of (dateKey, pool); the pool is cached 1h upstream so this is cheap.
 */
export async function getToday(dateOverride?: string): Promise<Today> {
  const dateKey = dateOverride ?? getDateKey();
  const pool = await getSongPool();
  const chart = pickDailyChart(pool, dateKey);
  const plan = buildStepPlan(chart, dateKey);
  return { dateKey, chart, plan };
}

export function buildReveal(chart: Chart): Reveal {
  return {
    songId: chart.songId,
    songName: chart.songName,
    artist: chart.artist,
    cover: chart.cover,
    difficulty: chart.difficulty,
    level: chart.level,
    levelPrecise: chart.levelPrecise,
    type: chart.type,
  };
}

/**
 * Compute the text payload shown alongside text-kind hints. Dispatches to the
 * per-kind describer in the hints registry; image kinds have no extras and
 * return just `{ level }`.
 */
export function describeHint(
  hint: Hint,
  chart: Chart,
  dateKey: string,
): Record<string, unknown> {
  const extras = HINTS[hint.kind].describe?.(hint.level, chart, dateKey) ?? {};
  return { level: hint.level, ...extras };
}

export { TOTAL_STEPS };
