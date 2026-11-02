"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useGame } from "@/components/providers/game-provider";
import { CoverImage } from "@/components/cover-image";
import { Link } from "@/i18n/navigation";
import { codeOf } from "@/lib/games/codes";
import { getGameDifficulty } from "@/lib/games/presentation";
import { getGame } from "@/lib/games/registry";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { useSongDetail } from "./song-detail-provider";
import type { ChartTypeKey, SongExtendedIdentified, UniqueSong } from "./types";

const PER_ROW = 10;
// A constant within this many tenths of a level reads as the same difficulty.
const SIMILAR_LEVEL = 1;

type Row = { key: string; title: string; songs: { song: UniqueSong; note?: string; noteClass?: string }[] };

/** Songs by the same artist, charted by the same designer, or with a chart of about the same constant. */
export function RelatedSongs({ songName, artist, type, charts, inPlace }: {
  songName: string;
  artist: string;
  type: ChartTypeKey;
  charts: readonly SongExtendedIdentified[];
  inPlace: boolean;
}) {
  const t = useTranslations("db.songs.detail.related");
  const game = useGame();
  const { openSongDetail } = useSongDetail();
  const { data: catalog } = trpc.user.getAllUniqueSongs.useQuery({ game: game.id }, { staleTime: 3600000, refetchOnWindowFocus: false });

  const rows = useMemo((): Row[] => {
    if (!catalog) return [];
    const others = catalog.filter(song => !(song.songName === songName && song.artist === artist && song.type === type));
    const { rating } = getGame(game.id);
    const rated = charts.filter(chart => rating.isRated(codeOf(game.id, "difficulty", chart.difficulty)) && chart.levelPrecise > 0);
    const top = rated.reduce<SongExtendedIdentified | null>((best, chart) => !best || chart.levelPrecise > best.levelPrecise ? chart : best, null);
    const designer = [...charts].reverse().find(chart => chart.noteDesigner)?.noteDesigner ?? null;
    const result: Row[] = [];

    const sameArtist = others.filter(song => song.artist === artist).slice(0, PER_ROW);
    if (sameArtist.length > 0) result.push({ key: "artist", title: t("artist", { artist }), songs: sameArtist.map(song => ({ song })) });

    if (designer) {
      const byDesigner = others.filter(song => song.difficulties.some(chart => chart.noteDesigner === designer)).slice(0, PER_ROW);
      if (byDesigner.length > 0) result.push({ key: "designer", title: t("designer", { designer }), songs: byDesigner.map(song => ({ song })) });
    }

    if (top) {
      const difficulty = getGameDifficulty(game.id, codeOf(game.id, "difficulty", top.difficulty));
      const similar = others
        .flatMap(song => {
          const chart = song.difficulties.find(entry => entry.difficulty === top.difficulty && Math.abs(entry.levelPrecise - top.levelPrecise) <= SIMILAR_LEVEL);
          return chart ? [{ song, chart }] : [];
        })
        .sort((a, b) => Math.abs(a.chart.levelPrecise - top.levelPrecise) - Math.abs(b.chart.levelPrecise - top.levelPrecise))
        .slice(0, PER_ROW);
      if (similar.length > 0) {
        result.push({
          key: "level",
          title: t("level", { difficulty: difficulty.label, level: (top.levelPrecise / 10).toFixed(1) }),
          songs: similar.map(({ song, chart }) => ({ song, note: (chart.levelPrecise / 10).toFixed(1), noteClass: difficulty.classes.chip })),
        });
      }
    }
    return result;
  }, [catalog, songName, artist, type, charts, game.id, t]);

  if (rows.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" />{t("title")}</h2>
      {rows.map(row => (
        <div key={row.key} className="space-y-2">
          <h3 className="truncate text-xs font-medium text-muted-foreground">{row.title}</h3>
          <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {row.songs.map(({ song, note, noteClass }) => {
              const body = (
                <>
                  <div className="relative">
                    <CoverImage coverUrl={song.cover} alt="" width={80} height={80} loading="lazy" className="size-20 rounded-md object-cover" />
                    {note && <span className={cn("absolute right-1 bottom-1 rounded px-1 text-[10px] font-semibold tabular-nums", noteClass)}>{note}</span>}
                  </div>
                  <span className="mt-1 block truncate text-xs font-medium">{song.songName}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{song.artist}</span>
                </>
              );
              return (
                <li key={song.slug} className="w-20 shrink-0">
                  {inPlace ? (
                    <button type="button" className="w-full text-left" onClick={() => openSongDetail({ publicId: song.parentIds[0] })}>{body}</button>
                  ) : (
                    <Link href={`/db/songs/${encodeURIComponent(song.slug)}`} scroll={false} className="block">{body}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
