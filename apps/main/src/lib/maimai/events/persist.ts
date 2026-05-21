import { db } from "../../db";
import { userEvents } from "../../db/schema-pg";
import { logger } from "../../logger";
import type { EventAreaData, EventData } from "../types";

export async function insertUserEvents(
  snapshotId: number,
  areaEvents: EventData[],
  eventAreaEvents: EventAreaData[],
): Promise<void> {
  logger.info(`Starting user events insertion for snapshot ${snapshotId}`);

  const eventInserts: typeof userEvents.$inferInsert[] = [];

  for (const event of areaEvents) {
    eventInserts.push({
      snapshotId: snapshotId,
      eventType: "area",
      name: event.name,
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
      eventPeriodStart: null,
      eventPeriodEnd: null,
    });
  }

  for (const event of eventAreaEvents) {
    eventInserts.push({
      snapshotId: snapshotId,
      eventType: "eventArea",
      name: event.name,
      currentDistance: event.currentDistance,
      nextRewardDistance: event.nextRewardDistance,
      state: event.state,
      imageUrl: event.imageUrl,
      eventPeriodStart: event.eventPeriod ? new Date(event.eventPeriod[0]) : null,
      eventPeriodEnd: event.eventPeriod ? new Date(event.eventPeriod[1]) : null,
    });
  }

  logger.info(`Total events to insert: ${eventInserts.length}`);

  if (eventInserts.length === 0) {
    logger.warn("No events to insert");
    return;
  }

  logger.info(`Batch inserting ${eventInserts.length} user events`);
  await db.insert(userEvents).values(eventInserts);
  logger.info(`Successfully inserted ${eventInserts.length} user events`);
}
