"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Clock, Images, MapPin } from "lucide-react";
import { useGame } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import type { Region } from "@/lib/games/ids";
import { formatGameScore, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import { cn } from "@/lib/utils";

type Play = { region: Region; difficulty: string; playedAt: Date; scoreValue: number; comboStatus: number; syncStatus: number; clearStatus: number };
type Photo = { id: string; region: Region; difficulty: string; takenAt: Date; venue: string | null; imageKey: string };

/** The viewer's latest plays of this song. */
export function SongRecentPlays({ plays, showRegion }: { plays: readonly Play[]; showRegion: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  const game = useGame().id;
  if (plays.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" />{t("db.songs.detail.recentPlays")}</h2>
      <ol className="divide-y rounded-md border">
        {plays.map(play => {
          const difficulty = getGameDifficulty(game, codeOf(game, "difficulty", play.difficulty));
          return (
            <li key={`${play.region}-${play.playedAt.getTime()}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className={cn("w-12 shrink-0 text-xs font-bold", difficulty.classes.text)}>{difficulty.shortLabel}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {format.dateTime(play.playedAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {showRegion && ` · ${t(`regions.${play.region}`)}`}
              </span>
              <span className="text-xs text-muted-foreground">{getGameStatusLabels(game, play).join(" ")}</span>
              <span className="font-mono text-sm tabular-nums">{formatGameScore(game, play.scoreValue)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Arcade photos the viewer took of this song. */
export function SongPhotos({ photos }: { photos: readonly Photo[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const game = useGame().id;
  if (photos.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Images className="h-4 w-4" />{t("db.songs.detail.photos")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map(photo => {
          const url = `${process.env.NEXT_PUBLIC_R2_URL}/${photo.imageKey}`;
          const difficulty = getGameDifficulty(game, codeOf(game, "difficulty", photo.difficulty));
          return (
            <a key={photo.id} href={url} target="_blank" rel="noopener noreferrer" className="group space-y-1">
              <div className="aspect-video overflow-hidden rounded-md bg-muted">
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("font-bold", difficulty.classes.text)}>{difficulty.shortLabel}</span>
                <span className="truncate">{format.dateTime(photo.takenAt, { year: "numeric", month: "short", day: "numeric" })}</span>
              </div>
              {photo.venue && <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{photo.venue}</div>}
            </a>
          );
        })}
      </div>
    </section>
  );
}
