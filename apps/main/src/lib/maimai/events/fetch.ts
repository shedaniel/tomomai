import { logger } from "../../logger";
import { Region } from "../../types";
import { gameBaseUrl } from "@/lib/games/sites";
import { getGameHtml } from "@/server/services/games/sega/http";
import type { EventAreaData, EventData } from "../types";
import { parseAreaEvents, parseEventAreaEvents } from "./parse";

export async function fetchEventsData(cookies: string, region: Region, sessionId: bigint): Promise<{ areaEvents: EventData[], eventAreaEvents: EventAreaData[] }> {
  void sessionId;
  const baseUrl = gameBaseUrl("maimai", region);
  const referer = `${baseUrl}/maimai-mobile/`;

  logger.info(`Starting events data fetch for ${region} region...`);

  try {
    const [areaHtml, eventAreaHtml] = await Promise.all([
      getGameHtml("maimai", region, `${baseUrl}/maimai-mobile/map/`, cookies, referer),
      getGameHtml("maimai", region, `${baseUrl}/maimai-mobile/map/eventMap/`, cookies, referer),
    ]);

    const areaEvents = parseAreaEvents(areaHtml);
    logger.debug(`Parsed ${areaEvents.length} area events`);

    const eventAreaEvents = parseEventAreaEvents(eventAreaHtml, region);
    logger.debug(`Parsed ${eventAreaEvents.length} event area events`);

    return { areaEvents, eventAreaEvents };
  } catch (error) {
    logger.error(error, "Error fetching events data");
    throw error;
  }
}
