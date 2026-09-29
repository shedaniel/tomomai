import "server-only";
import { logger } from "@/lib/logger";
import type { Region } from "@/lib/types";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import type { EventAreaData, EventData } from "../types";
import { parseAreaEvents, parseEventAreaEvents } from "./parse";

export async function fetchEventsData(site: GameSiteClient, region: Region): Promise<{ areaEvents: EventData[], eventAreaEvents: EventAreaData[] }> {
  logger.info(`Starting events data fetch for ${region} region...`);

  try {
    const [areaHtml, eventAreaHtml] = await Promise.all([
      site.html("map/"),
      site.html("map/eventMap/"),
    ]);

    const areaEvents = parseAreaEvents(areaHtml, region);
    logger.debug(`Parsed ${areaEvents.length} area events`);

    const eventAreaEvents = parseEventAreaEvents(eventAreaHtml, region);
    logger.debug(`Parsed ${eventAreaEvents.length} event area events`);

    return { areaEvents, eventAreaEvents };
  } catch (error) {
    logger.error(error, "Error fetching events data");
    throw error;
  }
}
