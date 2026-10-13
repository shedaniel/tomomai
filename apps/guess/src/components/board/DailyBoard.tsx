"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@tomomai/ui";
import type { Leaderboard } from "@/lib/leaderboard";
import { isCalendarKey, LATE_VISIBLE_DAYS } from "@/lib/day";
import { useAccount } from "../account/AccountProvider";
import { BoardRow, EASE_OUT } from "./BoardRows";

const PREVIEW_ROWS = 5;

type Props = {
  dateKey: string;
  dateSlug?: string;
  won: boolean;
};

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-7 animate-pulse rounded-full bg-muted" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** The day's board, shown below the share button once the game is over. */
export function DailyBoard({ dateKey, dateSlug, won }: Props) {
  const t = useTranslations("guess.board");
  const reduce = useReducedMotion();
  const { enabled, viewer, signInHref } = useAccount();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);
  const tracked = enabled && isCalendarKey(dateKey);
  const signedIn = Boolean(viewer);

  useEffect(() => {
    if (!tracked) return;
    let cancelled = false;
    const query = dateSlug ? `?date=${encodeURIComponent(dateSlug)}` : "";
    fetch(`/api/leaderboard${query}`)
      .then((r) => (r.ok ? (r.json() as Promise<Leaderboard>) : Promise.reject(r.status)))
      .then((b) => !cancelled && setBoard(b))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [tracked, dateSlug, signedIn, won]);

  if (!tracked || failed) return null;

  const me = board?.viewer ?? null;
  const top = board?.entries.slice(0, PREVIEW_ROWS) ?? [];
  const showMeBelow = me && me.rank > PREVIEW_ROWS;
  const solveRate =
    board && board.stats.played ? Math.round((board.stats.solved / board.stats.played) * 100) : 0;
  const strong = (chunks: React.ReactNode) => (
    <span className="font-semibold text-foreground">{chunks}</span>
  );

  return (
    <section className="pt-8" aria-labelledby="daily-board-title">
      <div className="border-t-2 border-border pt-6">
        {!board ? (
          <Skeleton />
        ) : (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="daily-board-title" className="text-lg font-semibold tracking-tight">
                {dateSlug ? t("thatDay") : t("today")}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("playedSolved", { played: board.stats.played, rate: solveRate })}
              </span>
            </div>

            <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
              {me
                ? t.rich(me.late ? "placedLate" : "placed", {
                    rank: me.rank,
                    count: board.rankedCount,
                    strong,
                  })
                : viewer
                  ? won
                    ? t("tooLateToRank", { days: LATE_VISIBLE_DAYS })
                    : t("notSolved")
                  : t("guestNote")}
            </p>

            {top.length > 0 ? (
              <ol className="-mx-2 mt-4">
                {top.map((e, i) => (
                  <BoardRow key={e.rank} entry={e} index={i} />
                ))}
                {showMeBelow && (
                  <>
                    <li aria-hidden className="flex justify-center py-0.5 text-muted-foreground/60">
                      <EllipsisVertical className="size-4" />
                    </li>
                    <BoardRow entry={me} index={top.length + 1} />
                  </>
                )}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
            )}

            {!viewer && (
              <div className="mt-5 flex flex-col gap-3 rounded-lg bg-muted/60 p-3 pl-4 xs:flex-row xs:items-center">
                <p className="flex-1 text-sm leading-snug text-pretty">
                  {won ? t("signInPitchWon") : t("signInPitch")}
                </p>
                <Button asChild size="sm" className="shrink-0 self-start xs:self-auto">
                  <a href={signInHref()}>{t("signInCta")}</a>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}
