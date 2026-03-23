"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Search, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type EventStatus = "active" | "ended" | "upcoming";

/** If end date is missing, assume the event ends 14 months after start. */
function inferEnd(start: Date): Date {
  const d = new Date(start);
  d.setMonth(d.getMonth() + 14);
  return d;
}

/**
 * Parse "オンゲキちほー5" → { base: "オンゲキちほー", num: 5 }
 * Parse "トリコロちほー" → { base: "トリコロちほー", num: 1 }
 */
function parseEventSeries(name: string): { base: string; num: number } {
  const match = name.match(/^(.+?)(\d+)$/);
  if (match) return { base: match[1], num: parseInt(match[2], 10) };
  return { base: name, num: 1 };
}

/** Build a set of event names that have been superseded by a higher-numbered successor. */
function findSupersededEvents(names: string[]): Set<string> {
  const seriesMax = new Map<string, number>();
  const parsed = names.map((n) => ({ name: n, ...parseEventSeries(n) }));
  for (const { base, num } of parsed) {
    seriesMax.set(base, Math.max(seriesMax.get(base) ?? 0, num));
  }
  const superseded = new Set<string>();
  for (const { name, base, num } of parsed) {
    if (num < (seriesMax.get(base) ?? 0)) {
      superseded.add(name);
    }
  }
  return superseded;
}

function getEventStatus(
  periods: Array<{ start: string | null; end: string | null }>,
  superseded: boolean,
): EventStatus {
  const now = new Date();
  for (const period of periods) {
    const start = period.start ? new Date(period.start) : null;
    const end = period.end ? new Date(period.end) : (start ? inferEnd(start) : null);
    if (start && end) {
      if (now >= start && now <= end) return superseded ? "ended" : "active";
      if (now < start) return "upcoming";
    } else if (!start && end) {
      if (now <= end) return superseded ? "ended" : "active";
    }
  }
  if (periods.length === 0) return "ended";
  const allEnded = periods.every((p) => {
    const start = p.start ? new Date(p.start) : null;
    const end = p.end ? new Date(p.end) : (start ? inferEnd(start) : null);
    return end && now > end;
  });
  if (allEnded) return "ended";
  if (superseded) return "ended";
  return "upcoming";
}

function SectionHeader({ status }: { status: EventStatus }) {
  const t = useTranslations("db.events");
  return (
    <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {t(status)}
    </div>
  );
}

function formatPeriod(period: { start: string | null; end: string | null }) {
  const start = period.start ?? "?";
  const end = period.end ?? "?";
  return `${start} ~ ${end}`;
}

function formatDistance(distance: number): string {
  return `${distance}km`;
}

const STATUS_ORDER: Record<EventStatus, number> = { active: 0, upcoming: 1, ended: 2 };

export function EventsDatabase() {
  const t = useTranslations("db.events");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedEventName = searchParams.get("event");
  const [search, setSearch] = useState("");

  const { data: events, isLoading } = trpc.db.getEvents.useQuery();

  const eventsWithStatus = useMemo(() => {
    if (!events) return [];
    const superseded = findSupersededEvents(events.map((e) => e.name));
    return events.map((e) => ({
      ...e,
      status: getEventStatus(e.periods, superseded.has(e.name)),
    }));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase();
    const filtered = query
      ? eventsWithStatus.filter((e) => e.name.toLowerCase().includes(query))
      : eventsWithStatus;
    return filtered.sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      const latestStart = (periods: typeof a.periods) =>
        periods.reduce<string | null>((max, p) => {
          if (!p.start) return max;
          return !max || p.start > max ? p.start : max;
        }, null);
      const aStart = latestStart(a.periods);
      const bStart = latestStart(b.periods);
      if (aStart && bStart) return bStart.localeCompare(aStart);
      if (aStart) return -1;
      if (bStart) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [eventsWithStatus, search]);

  const selectedEvent = useMemo(
    () => eventsWithStatus.find((e) => e.name === selectedEventName) ?? null,
    [eventsWithStatus, selectedEventName],
  );

  const selectEvent = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", name);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearSelection = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("event");
    const str = params.toString();
    router.replace(str ? `${pathname}?${str}` : pathname, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        {t("noEvents")}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-6 pt-3">
      <VisuallyHidden asChild>
        <h1>{t("title")}</h1>
      </VisuallyHidden>

      {/* Sidebar */}
      <aside
        className={cn(
          "md:w-64 md:shrink-0",
          selectedEvent && "hidden md:block",
        )}
      >
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <nav className="space-y-0.5 max-md:-mx-2">
          {filteredEvents.map((event, i) => {
            const prevStatus = i > 0 ? filteredEvents[i - 1].status : null;
            const showHeader = event.status !== prevStatus;
            return (
              <div key={event.id}>
                {showHeader && <SectionHeader status={event.status} />}
                <button
                  onClick={() => selectEvent(event.name)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedEvent?.name === event.name
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <span className="line-clamp-2">{event.name}</span>
                </button>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              {t("noEvents")}
            </div>
          )}
        </nav>
      </aside>

      {/* Detail */}
      <main
        className={cn(
          "flex-1 min-w-0",
          !selectedEvent && "hidden md:block",
        )}
      >
        {selectedEvent ? (
          <div className="space-y-6">
            {/* Back button (mobile only) */}
            <button
              onClick={clearSelection}
              className="md:hidden flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </button>

            {/* Event name + status */}
            <div>
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t(selectedEvent.status)}
              </span>
              <h2 className="text-xl font-semibold">{selectedEvent.name}</h2>
            </div>

            {/* Periods */}
            {selectedEvent.periods.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium text-muted-foreground">{t("period")}</h3>
                <div className="space-y-1">
                  {selectedEvent.periods.map((period, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{formatPeriod(period)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Steps */}
            {selectedEvent.steps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t("steps")}</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24 pl-4">{t("distance")}</TableHead>
                        <TableHead className="w-32">{t("type")}</TableHead>
                        <TableHead>{t("reward")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEvent.steps.map((step, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm pl-4">
                            {formatDistance(step.distance)}
                          </TableCell>
                          <TableCell className="text-sm">{step.type}</TableCell>
                          <TableCell className="text-sm">{step.reward}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            {t("selectEvent")}
          </div>
        )}
      </main>
    </div>
  );
}
