"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SnapshotWithSongs } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { Map, Zap, CheckCircle2, Gift, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Tabs, TabsList, TabsPanels, TabsTab,TabsPanel } from "@/components/animate-ui/components/base/tabs";
import { EventData } from "@/lib/types";

function EventCard({ event }: { event: EventData }) {
  const t = useTranslations();
  const isCompleted = event.state === "completed";
  const isNotStarted = event.state === "not_started";

  const formatDistance = (distance: number) => {
    return distance.toLocaleString();
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case "not_started":
        return t("events.notStarted");
      case "in_progress":
        return t("events.inProgress");
      case "completed":
        return t("events.completed");
      default:
        return state;
    }
  };

  return (
    <div className="flex flex-col gap-3 py-4 px-4 border-b last:border-b-0">
      {/* Row 1: Image and Name/Badge */}
      <div className="flex items-center xs:items-start gap-3">
        {/* Event Image */}
        <div className="flex items-start min-w-0">
          <Image
            src={createSafeMaimaiImageUrl(event.imageUrl)}
            alt={event.name}
            className="w-20 h-20 xs:w-24 xs:h-24 rounded-lg object-contain border border-gray-300 dark:border-gray-600 aspect-square flex-shrink-0"
            width={112}
            height={112}
            loading="lazy"
          />
        </div>

        {/* Name and Badge */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex flex-col xs:flex-row items-start xs:items-center gap-x-2 gap-y-1 xs:flex-nowrap w-full xs:w-auto">
            <h3 className="font-semibold xs:overflow-hidden xs:text-ellipsis xs:whitespace-nowrap xs:min-w-0">{event.name}</h3>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
              event.state === "not_started" && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
              event.state === "in_progress" && "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
              event.state === "completed" && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            )}>
              {getStateLabel(event.state)}
            </span>
          </div>

          {/* Row 2: Distance Progress Details - shown on xs and up */}
          <div className="hidden xs:block space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span>{t("events.currentDistance")} {formatDistance(event.currentDistance)} Km</span>
            </div>

            {!isNotStarted && event.nextRewardDistance !== null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Gift className="h-4 w-4" />
                <span>{t("events.nextReward")} {formatDistance(event.nextRewardDistance)} Km</span>
              </div>
            )}

            {isCompleted && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t("events.eventCompleted")}</span>
              </div>
            )}

            {/* Event Period for Event Area */}
            {event.eventType === "eventArea" && event.eventPeriodStart && event.eventPeriodEnd && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(event.eventPeriodStart).toLocaleDateString()} - {new Date(event.eventPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Distance Progress Details - shown on small screens only */}
      <div className="xs:hidden space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="h-4 w-4" />
          <span>{t("events.currentDistance")}: {formatDistance(event.currentDistance)} Km</span>
        </div>

        {!isNotStarted && event.nextRewardDistance !== null && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Gift className="h-4 w-4" />
            <span>{t("events.nextReward")}: {formatDistance(event.nextRewardDistance)} Km</span>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>{t("events.eventCompleted")}</span>
          </div>
        )}

        {/* Event Period for Event Area */}
        {event.eventType === "eventArea" && event.eventPeriodStart && event.eventPeriodEnd && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {new Date(event.eventPeriodStart).toLocaleDateString()} - {new Date(event.eventPeriodEnd).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function EventsList({ events }: { events: EventData[] }) {
  return (
    <>
      {/* Single column on small/medium screens */}
      <div className="lg:hidden divide-y divide-dashed -mx-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      
      {/* Two columns on large screens */}
      <div className="hidden lg:grid grid-cols-2 divide-x divide-dashed -mx-4">
        <div className="divide-y divide-dashed">
          {events.filter((_, i) => i % 2 === 0).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
        <div className="divide-y divide-dashed">
          {events.filter((_, i) => i % 2 === 1).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </>
  );
}

export function EventsCard({ selectedSnapshotData }: { selectedSnapshotData: SnapshotWithSongs }) {
  const t = useTranslations();

  const allEvents = selectedSnapshotData.events || [];
  const areaEvents = allEvents.filter((e) => e.eventType === "area");
  const eventAreaEvents = allEvents.filter((e) => e.eventType === "eventArea");

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Map className="h-5 w-5" />
          <CardTitle>{t("events.title")}</CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        {allEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("events.noEventsAvailable")}</div>
        ) : (
          <Tabs defaultValue="area" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTab value="area">
                {t("events.areaEvents")} ({areaEvents.length})
              </TabsTab>
              <TabsTab value="eventArea">
                {t("events.eventAreaEvents")} ({eventAreaEvents.length})
              </TabsTab>
            </TabsList>

            <TabsPanels>
            <TabsPanel value="area">
              {areaEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{t("events.noAreaEvents")}</div>
              ) : (
                <EventsList events={areaEvents} />
              )}
            </TabsPanel>

            <TabsPanel value="eventArea">
              {eventAreaEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{t("events.noEventAreaEvents")}</div>
              ) : (
                <EventsList events={eventAreaEvents} />
              )}
            </TabsPanel>
            </TabsPanels>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
