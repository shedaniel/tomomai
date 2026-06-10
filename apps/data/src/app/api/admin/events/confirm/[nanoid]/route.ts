import { NextRequest, NextResponse } from "next/server";
import { consumePending } from "@/server/services/admin/pending-confirmation";
import { db } from "@/lib/db";
import { tourEvents, tourEventSteps } from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";
import { publishCatalog } from "@/server/catalog/publish";

import { norm, normType, type EventsPendingPayload } from "@/server/services/admin/event-diff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nanoid: string }> },
) {
  const { nanoid } = await params;

  const pending = await consumePending<EventsPendingPayload>(nanoid);
  if (!pending) {
    return NextResponse.json(
      { error: "Confirmation not found or expired" },
      { status: 404 },
    );
  }
  if (pending.type !== "events") {
    return NextResponse.json(
      { error: "Invalid confirmation type" },
      { status: 400 },
    );
  }

  const events = pending.data.events;

  await db.transaction(async (tx) => {
    const batchSize = 1000;

    // Fetch existing events + steps
    const existingEvents = await tx.select().from(tourEvents);
    const existingSteps = await tx.select().from(tourEventSteps);

    // Key by normalized name so we can match old non-normalized rows
    const existingMap = new Map(
      existingEvents.map((ev) => [
        norm(ev.name),
        {
          event: ev,
          steps: existingSteps.filter((s) => s.eventId === ev.id),
        },
      ]),
    );

    // Delete old rows whose name differs after normalization
    // (they'll be re-inserted with the normalized name)
    const staleIds = existingEvents
      .filter((ev) => ev.name !== norm(ev.name))
      .map((ev) => ev.id);
    for (let i = 0; i < staleIds.length; i += batchSize) {
      const batch = staleIds.slice(i, i + batchSize);
      await tx.delete(tourEventSteps).where(inArray(tourEventSteps.eventId, batch));
      await tx.delete(tourEvents).where(inArray(tourEvents.id, batch));
    }

    // Determine which events are new or changed
    const normPeriods = (ps: any[]) => ps.map((p: any) => ({ start: p.start ?? null, end: p.end ?? null }));
    const changedEvents: typeof events = [];
    for (const event of events) {
      const existing = existingMap.get(event.name);
      // If old row was stale (non-normalized name), treat as new
      if (!existing || existing.event.name !== event.name) {
        changedEvents.push(event);
        continue;
      }
      const periodsChanged = JSON.stringify(normPeriods(existing.event.periods as any[])) !== JSON.stringify(normPeriods(event.periods));
      const existingStepData = existing.steps.map((s) => ({
        distance: s.distance,
        type: normType(s.type),
        reward: norm(s.reward),
      }));
      const newStepData = event.steps.map((s) => ({
        distance: Number.isInteger(s.distance) ? s.distance : Math.round(s.distance * 1000),
        type: s.type,
        reward: s.reward,
      }));
      const stepsChanged = JSON.stringify(existingStepData) !== JSON.stringify(newStepData);
      if (periodsChanged || stepsChanged) {
        changedEvents.push(event);
      }
    }

    // Batch upsert changed events
    const upsertedRows: { id: number; name: string }[] = [];
    for (let i = 0; i < changedEvents.length; i += batchSize) {
      const batch = changedEvents.slice(i, i + batchSize);
      const rows = await tx
        .insert(tourEvents)
        .values(batch.map((e) => ({ name: e.name, periods: e.periods })))
        .onConflictDoUpdate({
          target: tourEvents.name,
          set: {
            periods: sql`excluded.periods`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: tourEvents.id, name: tourEvents.name });
      upsertedRows.push(...rows);
    }

    // Build name → id map
    const nameToId = new Map(upsertedRows.map((r) => [r.name, r.id]));

    // Batch delete old steps only for changed events
    const changedIds = upsertedRows.map((r) => r.id);
    for (let i = 0; i < changedIds.length; i += batchSize) {
      const batch = changedIds.slice(i, i + batchSize);
      await tx.delete(tourEventSteps).where(inArray(tourEventSteps.eventId, batch));
    }

    // Batch insert new steps only for changed events
    const allSteps = changedEvents.flatMap((event) => {
      const eventId = nameToId.get(event.name)!;
      return event.steps.map((step) => ({
        eventId,
        distance: Number.isInteger(step.distance) ? step.distance : Math.round(step.distance * 1000),
        type: step.type,
        reward: step.reward,
      }));
    });

    for (let i = 0; i < allSteps.length; i += batchSize) {
      const batch = allSteps.slice(i, i + batchSize);
      await tx.insert(tourEventSteps).values(batch);
    }
  });

  // Publish the updated catalog so consumers pick up the new events
  const manifest = await publishCatalog();

  return NextResponse.json({
    success: true,
    eventsUpserted: events.length,
    manifest,
  });
}
