import "server-only";
import type { Region } from "@/lib/types";
import type { GameSiteClient } from "@/server/services/games/sega/http";
import type { EventsData } from "../types";
import { parseAreaEvents, parseEventAreaEvents } from "./parse";

export async function fetchEventsData(site: GameSiteClient, region: Region): Promise<EventsData> {
  const [areaHtml, eventAreaHtml] = await Promise.all([
    site.html("map/"),
    site.html("map/eventMap/"),
  ]);
  return { areaEvents: parseAreaEvents(areaHtml, region), eventAreaEvents: parseEventAreaEvents(eventAreaHtml, region) };
}
