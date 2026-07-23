"use client";

import { SnapshotWithSongs } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import { Map, Calendar, Flag, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Tabs, TabsList, TabsContents, TabsTrigger, TabsContent } from "@/components/animate-ui/components/radix/tabs";
import { EventData } from "@/lib/types";
import { trpc } from "@/lib/trpc-client";
import { useMemo } from "react";

type StepData = { distance: number; type: string; reward: string };

function StepProgress({
  currentDistance,
  steps,
  state,
}: {
  currentDistance: number;
  steps: StepData[];
  state: EventData["state"];
}) {
  const t = useTranslations();
  if (steps.length === 0) return null;

  const isNotStarted = state === "not_started";
  const isCompleted = state === "completed";
  const isReached = (distance: number) =>
    isCompleted || (!isNotStarted && currentDistance >= distance);

  const maxDistance = steps[steps.length - 1].distance;
  const clampedDistance = isCompleted ? maxDistance : isNotStarted ? 0 : Math.min(currentDistance, maxDistance);
  const progressPercent = maxDistance > 0 ? (clampedDistance / maxDistance) * 100 : (isCompleted ? 100 : 0);

  return (
    <div className="space-y-2 mt-3">
      {/* Progress bar with flags on top */}
      <div className="relative pt-4 px-2">
        {/* Step markers — above the bar */}
        <div className="absolute left-2 right-4 top-0 h-4">
          {steps.map((step, i) => {
            const position = maxDistance > 0 ? (step.distance / maxDistance) * 100 : 0;
            const reached = isReached(step.distance);
            return (
              <div
                key={i}
                className="absolute bottom-0"
                style={{ left: `${position}%` }}
              >
                <Flag
                  className={cn(
                    "h-3.5 w-3.5",
                    reached
                      ? "text-primary fill-primary/20"
                      : "text-muted-foreground/50",
                  )}
                />
              </div>
            );
          })}
        </div>

        {/* Bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {steps.map((step, i) => {
          const reached = isReached(step.distance);
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1 text-[11px]",
                reached ? "text-primary" : "text-muted-foreground",
              )}
            >
              {reached ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              ) : (
                <Flag className="h-3 w-3 shrink-0" />
              )}
              <span className={cn(reached && "line-through decoration-primary/50 decoration-2")}>
                {step.distance}km {step.reward}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({
  event,
  steps,
}: {
  event: EventData;
  steps: StepData[] | undefined;
}) {
  const t = useTranslations();
  const isCompleted = event.state === "completed";

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
    <div className="flex flex-col gap-2 py-4 px-4 border-b last:border-b-0">
      {/* Header: Image + Name/Status */}
      <div className="flex items-center gap-3">
        <Image
          src={createSafeMaimaiImageUrl(event.imageUrl)}
          alt={event.name}
          className="w-16 h-16 xs:w-20 xs:h-20 rounded-lg object-contain aspect-square flex-shrink-0"
          width={80}
          height={80}
          loading="lazy"
          sizes="(min-width: 475px) 80px, 64px"
          unoptimized={isR2Url(event.imageUrl)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-col xs:flex-row items-start xs:items-center gap-x-2 gap-y-0.5">
            <h3 className="font-semibold text-sm text-balance">
              {event.name}
            </h3>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
                event.state === "not_started" &&
                "bg-muted text-muted-foreground",
                event.state === "in_progress" &&
                "bg-primary/10 text-primary",
                event.state === "completed" &&
                "bg-primary/10 text-primary",
              )}
            >
              {getStateLabel(event.state)}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {isCompleted && <CheckCircle2 className="h-3 w-3 text-primary" />}
              {event.currentDistance.toLocaleString()} km
            </span>
            {event.nextRewardDistance !== null && event.state === "in_progress" && (
              <span className="text-muted-foreground/70">
                → {event.nextRewardDistance.toLocaleString()} km
              </span>
            )}
            {!isCompleted && steps && steps.length > 0 && (
              <span className="text-muted-foreground/50">
                / {steps[steps.length - 1].distance.toLocaleString()} km
              </span>
            )}
          </div>

          {event.eventType === "eventArea" && event.eventPeriodStart && event.eventPeriodEnd && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {new Date(event.eventPeriodStart).toLocaleDateString()} -{" "}
              {new Date(event.eventPeriodEnd).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar with steps */}
      {steps && steps.length > 0 && (
        <StepProgress
          currentDistance={event.currentDistance}
          steps={steps}
          state={event.state}
        />
      )}
    </div>
  );
}

function EventsList({
  events,
  stepsMap,
}: {
  events: EventData[];
  stepsMap: Record<string, StepData[]>;
}) {
  return (
    <>
      <div className="lg:hidden divide-y divide-dashed -mx-4">
        {events.map((event) => (
          <EventCard
            key={`${event.eventType}-${event.name}`}
            event={event}
            steps={stepsMap[event.name]}
          />
        ))}
      </div>

      <div className="hidden lg:grid grid-cols-2 divide-x divide-dashed -mx-4">
        <div className="divide-y divide-dashed">
          {events
            .filter((_, i) => i % 2 === 0)
            .map((event) => (
              <EventCard
                key={`${event.eventType}-${event.name}`}
                event={event}
                steps={stepsMap[event.name]}
              />
            ))}
        </div>
        <div className="divide-y divide-dashed">
          {events
            .filter((_, i) => i % 2 === 1)
            .map((event) => (
              <EventCard
                key={`${event.eventType}-${event.name}`}
                event={event}
                steps={stepsMap[event.name]}
              />
            ))}
        </div>
      </div>
    </>
  );
}

export function EventsCard({
  selectedSnapshotData,
}: {
  selectedSnapshotData: SnapshotWithSongs;
}) {
  const t = useTranslations();

  const allEvents = (selectedSnapshotData.events || []).filter((e) => e.name.trim() !== "");
  const areaEvents = allEvents.filter((e) => e.eventType === "area");
  const eventAreaEvents = allEvents.filter((e) => e.eventType === "eventArea");

  const eventNames = useMemo(() => allEvents.map((e) => e.name), [allEvents]);

  const { data: tourSteps, isLoading: isStepsLoading } = trpc.db.getEventStepsByNames.useQuery(
    { names: eventNames },
    { enabled: eventNames.length > 0 },
  );

  const stepsMap = useMemo(() => {
    const map: Record<string, StepData[]> = {};
    if (tourSteps) {
      for (const ts of tourSteps) {
        map[ts.name] = ts.steps;
      }
    }
    return map;
  }, [tourSteps]);

  return (
    <div className="w-full space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Map className="h-5 w-5" />
        {t("events.title")}
        {isStepsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </h2>

      <div>
        {allEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("events.noEventsAvailable")}
          </div>
        ) : (
          <Tabs defaultValue="area" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="area">
                {t("events.areaEvents")} ({areaEvents.length})
              </TabsTrigger>
              <TabsTrigger value="eventArea">
                {t("events.eventAreaEvents")} ({eventAreaEvents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContents>
              <TabsContent value="area">
                {areaEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t("events.noAreaEvents")}
                  </div>
                ) : (
                  <EventsList events={areaEvents} stepsMap={stepsMap} />
                )}
              </TabsContent>

              <TabsContent value="eventArea">
                {eventAreaEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t("events.noEventAreaEvents")}
                  </div>
                ) : (
                  <EventsList events={eventAreaEvents} stepsMap={stepsMap} />
                )}
              </TabsContent>
            </TabsContents>
          </Tabs>
        )}
      </div>
    </div>
  );
}
