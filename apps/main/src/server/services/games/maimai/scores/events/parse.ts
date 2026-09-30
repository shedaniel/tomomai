import "server-only";
import { load } from "cheerio";
import { getLogger } from "@/lib/request-logger";
import { siteRoot } from "@/lib/games/sites";
import type { Region } from "@/lib/types";
import type { EventAreaData, EventData } from "../types";

// Parse event period string and extract start/end timestamps
function parseEventPeriod(periodStr: string | null): [number, number] | null {
  if (!periodStr) return null;

  // Match pattern: "Event period：YYYY/MM/DD HH:mm～YYYY/MM/DD HH:mm"
  const match = periodStr.match(/Event period：(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})～(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);

  if (!match) {
    getLogger().warn({ value: periodStr }, "Could not parse a maimai event period");
    return null;
  }

  const [
    ,
    startYear, startMonth, startDay, startHour, startMin,
    endYear, endMonth, endDay, endHour, endMin
  ] = match;

  try {
    const startDate = new Date(`${startYear}-${startMonth}-${startDay}T${startHour}:${startMin}:00+09:00`);
    const endDate = new Date(`${endYear}-${endMonth}-${endDay}T${endHour}:${endMin}:00+09:00`);

    return [startDate.getTime(), endDate.getTime()];
  } catch (error) {
    getLogger().warn({ err: error, value: periodStr }, "Could not parse maimai event period dates");
    return null;
  }
}

export function parseAreaEvents(html: string, region: Region): EventData[] {
  const $ = load(html);
  const events: EventData[] = [];
  const root = siteRoot("maimai", region);

  const elements = $(".m_10.m_t_0.f_0");

  elements.each((index, element) => {
    try {
      const $element = $(element);

      const nameElement = $element.find(".map_name_block_inner");
      const eventName = nameElement.text().trim();

      const basicBlock = $element.find(".basic_block");
      const currentDistanceStr = basicBlock.text().trim();
      const currentDistance = parseInt(currentDistanceStr.replace(/[^\d]/g, ''), 10) || 0;

      const imageElement = $element.find("img.w_180");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = new URL(imageSrc, root).href;
        }
      }

      let nextRewardDistance: number | null = null;
      let state: "not_started" | "in_progress" | "completed" = "in_progress";

      const f11Element = $element.find(".f_11");
      if (f11Element.length > 0) {
        const f14Element = f11Element.find(".f_14");

        if (f14Element.length === 0) {
          state = "not_started";
        } else {
          const rewardText = f14Element.text().trim();

          if (rewardText === "--") {
            state = "completed";
            nextRewardDistance = null;
          } else {
            nextRewardDistance = parseInt(rewardText, 10) || null;
          }
        }
      }

      events.push({
        name: eventName,
        currentDistance,
        nextRewardDistance,
        state,
        imageUrl
      });
    } catch (error) {
      getLogger().error({ err: error, index }, "Could not read a maimai area event");
    }
  });

  return events;
}

export function parseEventAreaEvents(html: string, region: Region): EventAreaData[] {
  const $ = load(html);
  const events: EventAreaData[] = [];
  const root = siteRoot("maimai", region);

  const elements = $(".eventmap_container");

  elements.each((index, element) => {
    try {
      const $element = $(element);

      const nameElement = $element.find(".map_name_block_inner");
      const eventName = nameElement.text().trim();

      const periodElement = $element.find(".t_r.f_11.white");
      const eventPeriod = periodElement.text().trim() || null;

      const basicBlock = $element.find(".basic_block");
      const currentDistanceStr = basicBlock.text().trim();
      const currentDistance = parseInt(currentDistanceStr.replace(/[^\d]/g, ''), 10) || 0;

      const imageElement = $element.find("img.w_180");
      let imageUrl = "";
      if (imageElement.length > 0) {
        const imageSrc = imageElement.attr("src");
        if (imageSrc) {
          imageUrl = new URL(imageSrc, root).href;
        }
      }

      let nextRewardDistance: number | null = null;
      let state: "not_started" | "in_progress" | "completed" = "in_progress";

      const f11Element = $element.find(".f_11");
      if (f11Element.length > 0) {
        const f14Element = f11Element.find(".f_14");

        if (f14Element.length === 0) {
          state = "not_started";
        } else {
          const rewardText = f14Element.text().trim();

          if (rewardText === "--") {
            state = "completed";
            nextRewardDistance = null;
          } else {
            nextRewardDistance = parseInt(rewardText, 10) || null;
          }
        }
      }

      events.push({
        name: eventName,
        currentDistance,
        nextRewardDistance,
        state,
        imageUrl,
        eventPeriod: parseEventPeriod(eventPeriod),
      });
    } catch (error) {
      getLogger().error({ err: error, index }, "Could not read a maimai event area event");
    }
  });

  return events;
}
