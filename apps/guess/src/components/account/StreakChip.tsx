"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { Flame } from "lucide-react";
import { cn } from "@tomomai/ui/utils";
import { useAccount } from "./AccountProvider";

/**
 * Header streak counter. The flame stays grey while today's song is still
 * unsolved (the streak is at stake) and lights up with a short pop once it is.
 */
export function StreakChip() {
  const t = useTranslations("guess.account");
  const reduce = useReducedMotion();
  const { viewer, openStats } = useAccount();
  if (!viewer || viewer.streak.current === 0) return null;
  const { current, solvedToday } = viewer.streak;

  return (
    <button
      type="button"
      onClick={openStats}
      aria-label={solvedToday ? t("streakSafe", { count: current }) : t("streakAtRisk", { count: current })}
      title={solvedToday ? t("streakSafe", { count: current }) : t("streakAtRisk", { count: current })}
      className="flex h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold tabular-nums outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <motion.span
        key={String(solvedToday)}
        initial={reduce || !solvedToday ? false : { scale: 0.6, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 14 }}
        className="flex"
      >
        <Flame
          className={cn(
            "size-4 transition-colors duration-500",
            solvedToday ? "text-orange-500" : "text-muted-foreground",
          )}
          fill={solvedToday ? "currentColor" : "none"}
          aria-hidden
        />
      </motion.span>
      <span className={solvedToday ? "text-foreground" : "text-muted-foreground"}>{current}</span>
    </button>
  );
}
