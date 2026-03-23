import { db } from "@/lib/db";
import { tourEvents, tourEventSteps } from "@/lib/db/schema-pg";

export type ScrapedEvent = {
  name: string;
  periods: Array<{ start: string | null; end: string | null }>;
  steps: Array<{ distance: number; type: string; reward: string }>;
};

export type EventsPendingPayload = {
  events: ScrapedEvent[];
  description: string;
};

type StepSummary = { distance: number; type: string; reward: string };

export type EventDelta = {
  added: { name: string; steps: StepSummary[] }[];
  removed: { name: string; steps: StepSummary[] }[];
  modified: { name: string; detail: string }[];
};

function formatPeriod(p: { start: string | null; end: string | null }) {
  return `${p.start ?? "?"}~${p.end ?? "?"}`;
}

/** Normalize a string for comparison (NFKC + strip zero-width chars + trim) */
export function norm(s: string): string {
  return s.normalize("NFKC").replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "").trim();
}

export const TYPE_ALIASES: Record<string, string> = {
  "課題曲": "楽曲",
  "解禁楽曲": "楽曲",
  "譜面": "楽曲",
  "プレート": "ネームプレート",
  "KALEIDX SCOPE": "KALEIDXSCOPE",
};

/** Normalize a step type for comparison */
export function normType(s: string): string {
  const n = norm(s);
  return TYPE_ALIASES[n] ?? n;
}

export async function computeEventDelta(events: ScrapedEvent[]): Promise<EventDelta> {
  const existingEvents = await db.select().from(tourEvents);
  const existingSteps = await db.select().from(tourEventSteps);
  const existingMap = new Map(
    existingEvents.map((ev) => [
      norm(ev.name),
      {
        event: ev,
        steps: existingSteps.filter((s) => s.eventId === ev.id),
      },
    ]),
  );

  const scrapedNames = new Set(events.map((e) => e.name));
  const added = events
    .filter((e) => !existingMap.has(e.name))
    .map((e) => ({ name: e.name, steps: e.steps }));
  const removed = existingEvents
    .filter((e) => !scrapedNames.has(norm(e.name)))
    .map((e) => ({
      name: e.name,
      steps: existingSteps
        .filter((s) => s.eventId === e.id)
        .map((s) => ({ distance: s.distance, type: s.type, reward: s.reward })),
    }));
  const modified: EventDelta["modified"] = [];

  for (const event of events) {
    const existing = existingMap.get(event.name);
    if (!existing) continue;
    const details: string[] = [];

    // Periods diff — normalize key order for comparison since JSONB may reorder keys
    const normalizePeriods = (ps: Array<{ start: string | null; end: string | null }>) =>
      ps.map((p) => ({ start: p.start ?? null, end: p.end ?? null }));
    const oldPeriods = normalizePeriods(existing.event.periods as Array<{ start: string | null; end: string | null }>);
    const newPeriods = normalizePeriods(event.periods);
    if (JSON.stringify(oldPeriods) !== JSON.stringify(newPeriods)) {
      const oldStr = oldPeriods.map(formatPeriod).join(", ");
      const newStr = newPeriods.map(formatPeriod).join(", ");
      details.push(`periods: ${oldStr} => ${newStr}`);
    }

    // Steps diff — normalize DB values before comparing
    const existingStepData = existing.steps.map((s) => ({
      distance: s.distance,
      type: normType(s.type),
      reward: norm(s.reward),
    }));
    if (JSON.stringify(existingStepData) !== JSON.stringify(event.steps)) {
      if (existingStepData.length === event.steps.length) {
        const diffs: string[] = [];
        for (let i = 0; i < event.steps.length; i++) {
          const old = existingStepData[i];
          const cur = event.steps[i];
          if (JSON.stringify(old) === JSON.stringify(cur)) continue;
          const parts: string[] = [];
          if (old.type !== cur.type) parts.push(`type: ${old.type}=>${cur.type}`);
          if (old.distance !== cur.distance) parts.push(`dist: ${old.distance}=>${cur.distance}`);
          if (old.reward !== cur.reward) parts.push(`${old.reward}=>${cur.reward}`);
          diffs.push(`[${i}] ${parts.join(", ")}`);
        }
        details.push(`steps: ${diffs.join(", ")}`);
      } else {
        const oldRewards = existingStepData.map((s) => s.reward).join(", ");
        const newRewards = event.steps.map((s) => s.reward).join(", ");
        details.push(`steps (${existingStepData.length}=>${event.steps.length}): ${oldRewards} => ${newRewards}`);
      }
    }

    if (details.length > 0) {
      modified.push({ name: event.name, detail: details.join(" | ") });
    }
  }

  return { added, removed, modified };
}

function formatSteps(steps: StepSummary[]): string {
  return steps.map((s) => `${s.distance}km ${s.type}: ${s.reward}`).join(", ");
}

export function formatEventDescription(delta: EventDelta): string {
  let description = "";
  if (delta.added.length > 0) {
    description += `**${delta.added.length} New Event${delta.added.length > 1 ? "s" : ""}**\n`;
    description += delta.added.map((e) => `- ${e.name}: ${formatSteps(e.steps)}`).join("\n") + "\n\n";
  }
  if (delta.removed.length > 0) {
    description += `**${delta.removed.length} Removed Event${delta.removed.length > 1 ? "s" : ""}**\n`;
    description += delta.removed.map((e) => `- ${e.name}: ${formatSteps(e.steps)}`).join("\n") + "\n\n";
  }
  if (delta.modified.length > 0) {
    description += `**${delta.modified.length} Modified Event${delta.modified.length > 1 ? "s" : ""}**\n`;
    description += delta.modified.map((m) => `- ${m.name}: ${m.detail}`).join("\n") + "\n\n";
  }
  if (delta.added.length === 0 && delta.removed.length === 0 && delta.modified.length === 0) {
    description += "No changes detected.\n\n";
  }
  return description;
}

export function deltaColor(delta: EventDelta): number {
  if (delta.removed.length > 0) return 0xFF0000;
  if (delta.added.length > 0) return 0x00FF00;
  if (delta.modified.length > 0) return 0xFFFF00;
  return 0x808080;
}
