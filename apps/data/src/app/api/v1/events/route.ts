import { db } from "@/lib/db";
import { tourEvents, tourEventSteps } from "@/lib/db/schema";
import type { ArtifactTourEvent, ArtifactTourEventStep } from "@tomomai/catalog/artifact";
import { NextResponse } from "next/server";

export const revalidate = 300;

type TourEventWithSteps = ArtifactTourEvent & {
  steps: Omit<ArtifactTourEventStep, "eventId">[];
};

// Public read API: tour events with their reward steps.
export async function GET() {
  const [eventRows, stepRows] = await Promise.all([
    db.select().from(tourEvents),
    db.select().from(tourEventSteps),
  ]);

  const stepsByEvent = new Map<number, Omit<ArtifactTourEventStep, "eventId">[]>();
  for (const step of stepRows) {
    const list = stepsByEvent.get(step.eventId) ?? [];
    list.push({
      id: step.id,
      distance: step.distance,
      type: step.type,
      reward: step.reward,
    });
    stepsByEvent.set(step.eventId, list);
  }

  const events: TourEventWithSteps[] = eventRows.map(e => ({
    id: e.id,
    name: e.name,
    periods: e.periods,
    steps: (stepsByEvent.get(e.id) ?? []).sort((a, b) => a.distance - b.distance),
  }));

  return NextResponse.json(
    { events },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
