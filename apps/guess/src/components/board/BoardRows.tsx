"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@tomomai/ui/utils";
import type { BoardEntry } from "@/lib/leaderboard";
import { isHeardle } from "@/lib/heardle-config";
import { audioSecondsFor, daysLate, formatClock } from "@/lib/format";
import { PlayerAvatar } from "../account/PlayerAvatar";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Gold, silver, bronze as text tints, each tuned for both themes. */
export const PLACE_TEXT = [
  "text-amber-600 dark:text-amber-400",
  "text-slate-500 dark:text-slate-300",
  "text-orange-700 dark:text-orange-400",
] as const;

export function useHintsLabel() {
  const t = useTranslations("guess.board");
  const heardle = isHeardle();
  return (hintsUsed: number) =>
    heardle
      ? t("audioSeconds", { seconds: audioSecondsFor(hintsUsed) })
      : t("hints", { count: hintsUsed });
}

export function EntryName({ entry, className }: { entry: BoardEntry; className?: string }) {
  const t = useTranslations("guess.board");
  if (!entry.name) {
    return <span className={cn("truncate italic text-muted-foreground", className)}>{t("anonymous")}</span>;
  }
  if (!entry.profileUrl) return <span className={cn("truncate", className)}>{entry.name}</span>;
  return (
    <a
      href={entry.profileUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "truncate underline-offset-4 decoration-foreground/30 hover:underline",
        className,
      )}
    >
      {entry.name}
    </a>
  );
}

export function SolveTime({ entry, className }: { entry: BoardEntry; className?: string }) {
  const t = useTranslations("guess.board");
  return (
    <span className={cn("tabular-nums", className)}>
      {entry.late ? t("lateBy", { days: daysLate(entry.msSinceStart) }) : formatClock(entry.msSinceStart)}
    </span>
  );
}

export function RankNumber({ entry, className }: { entry: BoardEntry; className?: string }) {
  const podium = entry.rank <= 3 && !entry.late;
  return (
    <span
      className={cn(
        "text-right tabular-nums",
        podium ? cn("font-bold", PLACE_TEXT[entry.rank - 1]) : "text-muted-foreground",
        className,
      )}
    >
      {entry.rank}
    </span>
  );
}

/** Sweeps the viewer's highlight in once the rows around it have landed. */
function ViewerWash({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 -z-10 rounded-lg bg-primary/12 ring-1 ring-inset ring-primary/25"
      initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0 round 0.5rem)" }}
      animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0 round 0.5rem)" }}
      transition={{ delay, duration: reduce ? 0.2 : 0.55, ease: EASE_OUT }}
    />
  );
}

export function BoardRow({
  entry,
  index = 0,
  trailing,
}: {
  entry: BoardEntry;
  /** Position in the rendered list, for the entrance stagger. */
  index?: number;
  trailing?: ReactNode;
}) {
  const t = useTranslations("guess.board");
  const hintsLabel = useHintsLabel();
  const reduce = useReducedMotion();
  const delay = Math.min(index, 10) * 0.035;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: EASE_OUT }}
      className="relative isolate grid grid-cols-[1.75rem_auto_1fr_auto] items-center gap-x-3 px-2 py-2"
    >
      {entry.isViewer && <ViewerWash delay={delay + 0.3} />}
      <RankNumber entry={entry} className="text-sm" />
      <PlayerAvatar image={entry.image} name={entry.name} className="size-7 text-xs" />
      <div className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
        <EntryName entry={entry} />
        {entry.isViewer && (
          <span className="shrink-0 text-xs font-semibold text-primary">{t("you")}</span>
        )}
      </div>
      <div className="flex items-baseline gap-3 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">{hintsLabel(entry.hintsUsed)}</span>
        <SolveTime entry={entry} className="min-w-[4.25rem] text-right font-medium text-foreground/90" />
        {trailing}
      </div>
    </motion.li>
  );
}

/** How many hints each solve needed; `highlight` marks the viewer's bar. */
export function Distribution({
  distribution,
  highlight,
  labelFor,
}: {
  distribution: number[];
  highlight?: number | null;
  labelFor: (index: number) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...distribution);
  return (
    <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-x-3 gap-y-1.5">
      {distribution.map((count, i) => (
        <div key={i} className="contents">
          <span className="flex justify-end text-xs text-muted-foreground tabular-nums">
            {labelFor(i)}
          </span>
          <motion.div
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.05 + i * 0.04, duration: 0.6, ease: EASE_OUT }}
            style={{ width: `${(count / max) * 100}%`, originX: 0 }}
            className={cn(
              "h-3 min-w-[3px] rounded-[3px]",
              highlight === i ? "bg-emerald-500" : "bg-foreground/15",
            )}
          />
          <span
            className={cn(
              "text-xs tabular-nums",
              highlight === i ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}
