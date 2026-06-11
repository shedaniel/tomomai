import { db } from "@/lib/db";
import { tourEvents, tourEventSteps } from "@/lib/db/schema";
import { NextResponse } from "next/server";

export const revalidate = 300;

// Public read API: tour events with their reward steps. Events are identified
// by their unique name — internal integer ids never leave the service.
export async function GET() {
  const [eventRows, stepRows] = await Promise.all([
    db.select().from(tourEvents),
    db.select().from(tourEventSteps),
  ]);

  const stepsByEvent = new Map<number, { distance: number; type: string; reward: string }[]>();
  for (const step of stepRows) {
    const list = stepsByEvent.get(step.eventId) ?? [];
    list.push({
      distance: step.distance,
      type: step.type,
      reward: step.reward,
    });
    stepsByEvent.set(step.eventId, list);
  }

  const events = eventRows.map(e => ({
    name: e.name,
    periods: e.periods,
    steps: (stepsByEvent.get(e.id) ?? []).sort((a, b) => a.distance - b.distance),
  }));

  return NextResponse.json(
    { events },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
