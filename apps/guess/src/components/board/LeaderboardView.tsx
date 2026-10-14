"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Play } from "lucide-react";
import { Button } from "@tomomai/ui";
import { cn } from "@tomomai/ui/utils";
import type { BoardEntry, Leaderboard } from "@/lib/leaderboard";
import type { RevealPayload } from "@/lib/client-types";
import { isHeardle } from "@/lib/heardle-config";
import { audioSecondsFor } from "@/lib/format";
import { LATE_VISIBLE_DAYS } from "@/lib/day";
import { useAccount } from "../account/AccountProvider";
import { PlayerAvatar } from "../account/PlayerAvatar";
import {
  BoardRow,
  Distribution,
  EASE_OUT,
  EntryName,
  RankNumber,
  SolveTime,
  useHintsLabel,
} from "./BoardRows";

type Props = {
  board: Leaderboard;
  formattedDate: string;
  isToday: boolean;
  prevHref: string;
  nextHref: string | null;
  playHref: string;
  answer: RevealPayload | null;
};

/** The first three get room to breathe: bigger numerals and avatars, same row anatomy. */
function TopRow({ entry, index }: { entry: BoardEntry; index: number }) {
  const t = useTranslations("guess.board");
  const hintsLabel = useHintsLabel();
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: EASE_OUT }}
      className={cn(
        "grid grid-cols-[2.25rem_auto_1fr_auto] items-center gap-x-3 rounded-xl px-2 py-3",
        entry.isViewer && "bg-primary/12 ring-1 ring-inset ring-primary/25",
      )}
    >
      <RankNumber entry={entry} className="text-3xl font-black leading-none tracking-tight" />
      <PlayerAvatar image={entry.image} name={entry.name} className="size-10 text-base" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 text-base font-semibold">
          <EntryName entry={entry} />
          {entry.isViewer && (
            <span className="shrink-0 text-xs font-semibold text-primary">{t("you")}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{hintsLabel(entry.hintsUsed)}</div>
      </div>
      <SolveTime entry={entry} className="text-base font-semibold" />
    </motion.li>
  );
}

function AnswerSpoiler({ answer }: { answer: RevealPayload }) {
  const t = useTranslations("guess.leaderboard");
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      disabled={shown}
      aria-expanded={shown}
      className="group flex w-full items-center gap-3 rounded-xl border-2 border-border bg-card/60 p-2 pr-4 text-left outline-none transition-colors enabled:hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {answer.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={answer.cover}
            alt=""
            className={cn(
              "size-full object-cover transition-[filter,transform] duration-500 ease-out",
              shown ? "blur-0 scale-100" : "scale-110 blur-md",
            )}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{t("answer")}</div>
        {shown ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <div className="truncate text-sm font-semibold">{answer.songName}</div>
            <div className="truncate text-xs text-muted-foreground">{answer.artist}</div>
          </motion.div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Eye className="size-4" />
            {t("revealAnswer")}
          </div>
        )}
      </div>
    </button>
  );
}

export function LeaderboardView({
  board,
  formattedDate,
  isToday,
  prevHref,
  nextHref,
  playHref,
  answer,
}: Props) {
  const t = useTranslations("guess.leaderboard");
  const tb = useTranslations("guess.board");
  const { viewer, signInHref } = useAccount();
  const heardle = isHeardle();

  const onTime = board.entries.filter((e) => !e.late);
  const late = board.entries.filter((e) => e.late);
  const top = onTime.slice(0, 3);
  const rest = onTime.slice(3);
  const viewerOffBoard = board.viewer && board.viewer.rank > board.entries.length;
  const solveRate = board.stats.played
    ? Math.round((board.stats.solved / board.stats.played) * 100)
    : 0;

  return (
    <div className="pb-12">
      <Link
        href={playHref}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" />
        {isToday ? t("backToToday") : t("backToDay")}
      </Link>
      <div className="flex items-center gap-2 pt-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("previousDay")}>
          <Link href={prevHref}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {isToday ? t("todayDate", { date: formattedDate }) : formattedDate}
          </p>
        </div>
        {nextHref ? (
          <Button asChild variant="ghost" size="icon" aria-label={t("nextDay")}>
            <Link href={nextHref}>
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <span className="size-9" />
        )}
      </div>

      <section className="mt-6">
        {onTime.length > 0 ? (
          <ol className="-mx-2 space-y-1">
            {top.map((e, i) => (
              <TopRow key={e.rank} entry={e} index={i} />
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border-2 border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground text-balance">
            {isToday ? t("emptyToday") : t("emptyPast")}
          </p>
        )}
        {rest.length > 0 && (
          <ol className="-mx-2 mt-3 border-t-2 border-border pt-3">
            {rest.map((e, i) => (
              <BoardRow key={e.rank} entry={e} index={i + 3} />
            ))}
          </ol>
        )}
        {viewerOffBoard && board.viewer && (
          <ol className="-mx-2 mt-3 border-t-2 border-border pt-3">
            <BoardRow entry={board.viewer} index={rest.length + 3} />
          </ol>
        )}
      </section>

      {late.length > 0 && (
        <section className="mt-8 border-t-2 border-border pt-6">
          <h2 className="text-base font-semibold">{t("lateTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{t("lateDescription")}</p>
          <ol className="-mx-2 mt-3">
            {late.map((e, i) => (
              <BoardRow key={e.rank} entry={e} index={i} />
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8 border-t-2 border-border pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">{t("howItWent")}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tb("playedSolved", { played: board.stats.played, rate: solveRate })}
          </span>
        </div>
        <div className="mt-4">
          {board.stats.solved > 0 ? (
            <Distribution
              distribution={board.stats.distribution}
              highlight={board.viewer ? board.viewer.hintsUsed - 1 : null}
              labelFor={(i) => (heardle ? `${audioSecondsFor(i + 1)}s` : String(i + 1))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noSolves")}</p>
          )}
        </div>
      </section>

      {answer && (
        <section className="mt-8">
          <AnswerSpoiler answer={answer} />
        </section>
      )}

      <div className="mt-8 flex flex-col gap-2 xs:flex-row">
        <Button asChild className="flex-1">
          <Link href={playHref}>
            <Play />
            {isToday ? t("playToday") : t("playThisDay")}
          </Link>
        </Button>
        {!viewer && (
          <Button asChild variant="outline" className="flex-1">
            <a href={signInHref()}>{tb("signInCta")}</a>
          </Button>
        )}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground text-balance">
        {t("rules", { days: LATE_VISIBLE_DAYS })}
      </p>
    </div>
  );
}
