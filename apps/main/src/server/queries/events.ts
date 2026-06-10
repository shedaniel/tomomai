import { db } from "@/lib/db";
import { tourEvents, tourEventSteps } from "@/lib/db/schema-pg";
import { asc, inArray } from "drizzle-orm";
import { norm } from "@/lib/event-types";

export type TourEventWithSteps = {
  id: number;
  name: string;
  periods: Array<{ start: string | null; end: string | null }>;
  steps: Array<{ distance: number; type: string; reward: string }>;
  createdAt: Date;
  updatedAt: Date;
};

export type TourEventStepsOnly = {
  name: string;
  steps: Array<{ distance: number; type: string; reward: string }>;
};

export async function fetchTourEventsByNames(names: string[]): Promise<TourEventStepsOnly[]> {
  if (names.length === 0) return [];
  const normalizedNames = names.map(norm);
  const allEvents = await db.select({ id: tourEvents.id, name: tourEvents.name }).from(tourEvents);

  // Match by normalized name
  const matchedEvents = allEvents.filter((e) => normalizedNames.includes(norm(e.name)));
  if (matchedEvents.length === 0) return [];

  const eventIds = matchedEvents.map((e) => e.id);
  const steps = await db.select().from(tourEventSteps).where(inArray(tourEventSteps.eventId, eventIds));

  const stepsByEventId = new Map<number, typeof steps>();
  for (const step of steps) {
    const arr = stepsByEventId.get(step.eventId) ?? [];
    arr.push(step);
    stepsByEventId.set(step.eventId, arr);
  }

  // Build a map from normalized DB name → steps
  const normToSteps = new Map<string, TourEventStepsOnly["steps"]>();
  for (const event of matchedEvents) {
    normToSteps.set(
      norm(event.name),
      (stepsByEventId.get(event.id) ?? []).map((s) => ({
        distance: s.distance,
        type: s.type,
        reward: s.reward,
      })),
    );
  }

  // Return using the original input names so the client can match them
  const results: TourEventStepsOnly[] = [];
  for (const name of names) {
    const steps = normToSteps.get(norm(name));
    if (steps) {
      results.push({ name, steps });
    }
  }
  return results;
}

export async function fetchTourEvents(): Promise<TourEventWithSteps[]> {
  const events = await db.select().from(tourEvents).orderBy(asc(tourEvents.name));
  const steps = await db.select().from(tourEventSteps);

  const stepsByEventId = new Map<number, typeof steps>();
  for (const step of steps) {
    const arr = stepsByEventId.get(step.eventId) ?? [];
    arr.push(step);
    stepsByEventId.set(step.eventId, arr);
  }

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    periods: event.periods,
    steps: (stepsByEventId.get(event.id) ?? []).map((s) => ({
      distance: s.distance,
      type: s.type,
      reward: s.reward,
    })),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }));
}
