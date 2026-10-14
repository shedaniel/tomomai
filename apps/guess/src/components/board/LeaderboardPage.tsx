import { notFound } from "next/navigation";
import { getLocale } from "@tomomai/i18n/server";
import { getPlayer } from "@/lib/accounts/session";
import { accountsEnabled } from "@/lib/accounts/config";
import { formatDateKey, getRealTodayKey } from "@/lib/date-slug";
import { shiftDateKey, toSlug } from "@/lib/day";
import { getLeaderboard } from "@/lib/leaderboard";
import { buildReveal, getToday } from "@/lib/today";
import { SiteHeader } from "../SiteHeader";
import { LeaderboardView } from "./LeaderboardView";

function boardHref(dateKey: string, todayKey: string): string {
  return dateKey === todayKey ? "/leaderboard" : `/leaderboard/${toSlug(dateKey)}`;
}

/** Shared shell for `/leaderboard` (today) and `/leaderboard/[date]`. */
export async function LeaderboardPage({ dateKey }: { dateKey: string }) {
  if (!accountsEnabled()) notFound();
  const todayKey = getRealTodayKey();
  const isToday = dateKey === todayKey;
  const [locale, player] = await Promise.all([getLocale(), getPlayer()]);
  const board = await getLeaderboard(dateKey, player?.id ?? null);
  if (!board) notFound();

  // The answer stays hidden for today; past days offer it behind a spoiler.
  const answer = isToday ? null : buildReveal((await getToday(dateKey)).chart);

  return (
    <div className="container mx-auto max-w-md px-4 min-h-dvh flex flex-col">
      <SiteHeader />
      <LeaderboardView
        board={board}
        formattedDate={formatDateKey(dateKey, locale)}
        isToday={isToday}
        prevHref={boardHref(shiftDateKey(dateKey, -1), todayKey)}
        nextHref={isToday ? null : boardHref(shiftDateKey(dateKey, 1), todayKey)}
        playHref={isToday ? "/" : `/${toSlug(dateKey)}`}
        answer={answer}
      />
    </div>
  );
}
