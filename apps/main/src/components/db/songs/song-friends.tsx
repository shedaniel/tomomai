"use client";

import { useTranslations } from "next-intl";
import { User, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CoverImage } from "@/components/cover-image";
import { useGame } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { formatGameScore, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import { cn } from "@/lib/utils";
import type { FriendSongScores } from "@/server/services/friends/view";
import type { SongExtendedIdentified, UserScore } from "./types";
import { useSongInsights } from "./song-insights";

function FriendAvatar({ friend }: { friend: Pick<FriendSongScores, "iconUrl" | "image"> | null }) {
  const src = friend?.iconUrl || friend?.image;
  return src
    ? <CoverImage coverUrl={src} alt="" width={28} height={28} loading="lazy" className="size-7 shrink-0 rounded-full object-cover" />
    : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><User className="size-4" /></span>;
}

/** Friends who played this song, with their best score on each chart they played. */
export function SongFriends({ friends, difficulties, showRegion }: { friends: readonly FriendSongScores[]; difficulties: readonly string[]; showRegion: boolean }) {
  const t = useTranslations();
  const game = useGame().id;
  if (friends.length === 0) return null;
  const hardest = (friend: FriendSongScores) => difficulties.findLastIndex(difficulty => friend.scores[difficulty]);
  const sorted = [...friends].sort((a, b) => {
    const level = hardest(b) - hardest(a);
    if (level !== 0) return level;
    const difficulty = difficulties[hardest(a)];
    return (b.scores[difficulty]?.scoreValue ?? 0) - (a.scores[difficulty]?.scoreValue ?? 0);
  });
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />{t("db.songs.detail.friends.title")}</h2>
      <ul className="divide-y rounded-md border">
        {sorted.map(friend => (
          <li key={`${friend.username}-${friend.region}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
            <Link href={`/profile/${friend.username}/${friend.region}`} prefetch={false} className="flex min-w-40 flex-1 items-center gap-2 hover:underline">
              <FriendAvatar friend={friend} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{friend.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{friend.username}{showRegion && ` · ${t(`regions.${friend.region}`)}`}
                </span>
              </span>
            </Link>
            <span className="ml-auto flex flex-wrap justify-end gap-1.5">
              {difficulties.filter(difficulty => friend.scores[difficulty]).map(difficulty => {
                const style = getGameDifficulty(game, codeOf(game, "difficulty", difficulty));
                return (
                  <span key={difficulty} className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-xs tabular-nums">
                    <span className={cn("font-bold", style.classes.text)}>{style.shortLabel}</span>
                    <span className="font-mono">{formatGameScore(game, friend.scores[difficulty].scoreValue, { precision: "compact" })}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The viewer and their friends ranked on one chart. */
export function ChartFriendsRanking({ chart, score }: { chart: SongExtendedIdentified; score?: UserScore }) {
  const t = useTranslations();
  const game = useGame().id;
  const friends = (useSongInsights()?.friends ?? []).filter(friend => friend.region === chart.region && friend.scores[chart.difficulty]);
  if (friends.length === 0) return null;
  const rows = [
    ...friends.map(friend => ({ key: friend.username, friend, score: friend.scores[chart.difficulty] })),
    ...(score ? [{ key: "", friend: null, score }] : []),
  ].sort((a, b) => b.score.scoreValue - a.score.scoreValue);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium">{t("db.songs.detail.friends.ranking")}</div>
      <ol className="divide-y rounded-md border">
        {rows.map((row, index) => {
          const statuses = getGameStatusLabels(game, row.score).join(" ");
          const name = (
            <>
              <FriendAvatar friend={row.friend} />
              <span className="min-w-0 truncate">{row.friend ? row.friend.displayName : t("db.songs.detail.yourScore")}</span>
            </>
          );
          return (
            <li key={row.key} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs", !row.friend && "bg-primary/10 font-semibold")}>
              <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
              {row.friend
                ? <Link href={`/profile/${row.friend.username}/${row.friend.region}`} prefetch={false} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">{name}</Link>
                : <span className="flex min-w-0 flex-1 items-center gap-2">{name}</span>}
              {statuses && <span className="shrink-0 text-muted-foreground">{statuses}</span>}
              <span className="shrink-0 font-mono tabular-nums">{formatGameScore(game, row.score.scoreValue)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
