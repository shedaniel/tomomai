"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Flame, X } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Switch,
} from "@tomomai/ui";
import { cn } from "@tomomai/ui/utils";
import type { CalendarDay, PlayerStats } from "@/lib/leaderboard";
import { isHeardle } from "@/lib/heardle-config";
import { audioSecondsFor, formatClock, formatDuration } from "@/lib/format";
import { Distribution } from "../board/BoardRows";
import { useAccount } from "./AccountProvider";
import { PlayerAvatar } from "./PlayerAvatar";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

function Stat({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center">
      <span className="flex items-center gap-1 text-2xl font-semibold leading-none tabular-nums">
        {icon}
        {value}
      </span>
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function cellClass(day: CalendarDay, hintCount: number): string {
  if (day.status === "won" && day.hintsUsed) {
    if (day.late) return "ring-[1.5px] ring-inset ring-emerald-500/80";
    const strength = 1 - (day.hintsUsed - 1) / Math.max(1, hintCount - 1);
    if (strength > 0.75) return "bg-emerald-500";
    if (strength > 0.45) return "bg-emerald-500/75";
    return "bg-emerald-500/50";
  }
  if (day.status === "lost") return "bg-rose-500/70";
  if (day.status === "playing") return "bg-amber-400/70";
  return "bg-foreground/[0.07]";
}

/** Weeks as columns, Monday at the top, labelled like a wall calendar. */
function Calendar({
  days,
  todayKey,
  hintCount,
}: {
  days: CalendarDay[];
  todayKey: string;
  hintCount: number;
}) {
  const t = useTranslations("guess.stats");
  const locale = useLocale();

  const { weeks, monthLabels, weekdayLabels } = useMemo(() => {
    const lead = (new Date(`${days[0]!.dateKey}T00:00:00Z`).getUTCDay() + 6) % 7;
    const cells: (CalendarDay | null)[] = [...Array<null>(lead).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const weeks: (CalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    const monthLabels = weeks.map((week, w) => {
      const first = week.find((d) => d && (w === 0 || d.dateKey.endsWith("-01")));
      if (!first || (w === 0 && Number(first.dateKey.slice(8)) > 21)) return null;
      return monthFmt.format(new Date(`${first.dateKey}T00:00:00Z`));
    });

    const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    // 2024-01-01 was a Monday.
    const weekdayLabels = [0, 2, 4].map((i) => ({
      row: i,
      label: dayFmt.format(new Date(Date.UTC(2024, 0, 1 + i))),
    }));
    return { weeks, monthLabels, weekdayLabels };
  }, [days, locale]);

  return (
    <div className="space-y-2.5">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `1rem repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        <span />
        {monthLabels.map((label, w) => (
          <span
            key={w}
            className="h-4 overflow-visible whitespace-nowrap text-2xs leading-4 text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="contents">
            <span className="flex items-center text-2xs leading-none text-muted-foreground">
              {weekdayLabels.find((l) => l.row === row)?.label}
            </span>
            {weeks.map((week, w) => {
              const day = week[row];
              if (!day) return <span key={w} />;
              return (
                <span
                  key={w}
                  title={day.dateKey}
                  style={{ animationDelay: `${w * 22}ms` }}
                  className={cn(
                    "aspect-square rounded-[3px] motion-safe:animate-[calendar-cell-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]",
                    cellClass(day, hintCount),
                    day.dateKey === todayKey && "outline-2 outline-offset-1 outline-foreground/70",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pl-[calc(1rem+3px)] text-2xs text-muted-foreground">
        <Legend className="bg-emerald-500" label={t("legendSolved")} />
        <Legend className="ring-[1.5px] ring-inset ring-emerald-500/80" label={t("legendLate")} />
        <Legend className="bg-rose-500/70" label={t("legendMissed")} />
        <Legend className="bg-foreground/[0.07]" label={t("legendNone")} />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[2px]", className)} />
      {label}
    </span>
  );
}

export function StatsDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("guess.stats");
  const { viewer, setViewer } = useAccount();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [saving, setSaving] = useState(false);
  const heardle = isHeardle();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/me/stats")
      .then((r) => (r.ok ? (r.json() as Promise<PlayerStats>) : null))
      .then((s) => !cancelled && setStats(s));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!viewer) return null;

  const toggleVisibility = async (showOnLeaderboard: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnLeaderboard }),
      });
      if (res.ok) setViewer(((await res.json()) as { viewer: typeof viewer }).viewer);
    } finally {
      setSaving(false);
    }
  };

  const hintCount = stats ? stats.distribution.length - 1 : 0;
  const today = stats?.calendar.at(-1);
  const todayIndex = today?.status === "won" && today.hintsUsed ? today.hintsUsed - 1 : null;
  const winRate = stats?.played ? Math.round((stats.wins / stats.played) * 100) : 0;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <div className="flex items-center gap-3">
            <PlayerAvatar image={viewer.image} name={viewer.name} className="size-11 text-lg" />
            <div className="min-w-0 text-left">
              <ResponsiveDialogTitle className="truncate">{viewer.name}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {heardle ? t("subtitleHeardle") : t("subtitle")}
              </ResponsiveDialogDescription>
            </div>
          </div>
        </ResponsiveDialogHeader>

        {!stats ? (
          <div className="space-y-4" aria-busy>
            <div className="h-12 animate-pulse rounded-lg bg-muted/70" />
            <div className="h-40 animate-pulse rounded-lg bg-muted/70" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/70" />
          </div>
        ) : (
          <div className="space-y-7">
            <div className="grid grid-cols-4 divide-x divide-border">
              <Stat value={String(stats.played)} label={t("played")} />
              <Stat value={`${winRate}%`} label={t("winRate")} />
              <Stat
                value={String(stats.currentStreak)}
                label={t("streak")}
                icon={
                  stats.currentStreak > 0 ? (
                    <Flame className="size-5 text-orange-500" fill="currentColor" aria-hidden />
                  ) : undefined
                }
              />
              <Stat value={String(stats.bestStreak)} label={t("bestStreak")} />
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                {heardle ? t("distributionHeardle") : t("distribution")}
              </h3>
              <Distribution
                distribution={stats.distribution}
                highlight={todayIndex}
                labelFor={(i) =>
                  i === hintCount ? (
                    <X className="size-3.5" aria-label={t("legendMissed")} />
                  ) : heardle ? (
                    `${audioSecondsFor(i + 1)}s`
                  ) : (
                    String(i + 1)
                  )
                }
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("calendar")}</h3>
              <Calendar days={stats.calendar} todayKey={stats.todayKey} hintCount={hintCount} />
            </section>

            <dl className="grid grid-cols-3 gap-2 border-y-2 border-border py-3 text-center">
              <div>
                <dt className="text-2xs text-muted-foreground">
                  {heardle ? t("averageAudio") : t("averageHints")}
                </dt>
                <dd className="text-base font-semibold tabular-nums">
                  {stats.averageHints === null
                    ? "–"
                    : heardle
                      ? `${audioSecondsFor(Math.round(stats.averageHints))}s`
                      : stats.averageHints.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-muted-foreground">{t("earliest")}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {stats.earliestSolveMs === null ? "–" : formatClock(stats.earliestSolveMs)}
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-muted-foreground">{t("typicalSolve")}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {stats.medianSolveMs === null ? "–" : formatDuration(stats.medianSolveMs)}
                </dd>
              </div>
            </dl>

            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t("showOnBoard")}</span>
                <span className="block text-xs text-muted-foreground text-pretty">
                  {t("showOnBoardHint")}
                </span>
              </span>
              <Switch
                checked={viewer.showOnLeaderboard}
                disabled={saving}
                onCheckedChange={toggleVisibility}
              />
            </label>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
