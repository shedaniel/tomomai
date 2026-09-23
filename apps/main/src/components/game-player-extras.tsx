"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tomomai/ui";
import { useGame } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { formatGameScore, getGameDifficultyLabel, getGameStatusLabels } from "@/lib/games/presentation";
import type { Region } from "@/lib/types";
import type { fetchRecentSongs } from "@/server/queries/recents";
import type { fetchUserAlbums } from "@/server/queries/albums";
import type { CanonicalGameId } from "@/lib/games/types";

type Recent = Pick<Awaited<ReturnType<typeof fetchRecentSongs>>["recentPlays"][number], "recentSongId" | "songName" | "difficultyCode" | "level" | "playedAt" | "scoreValue" | "comboStatus" | "syncStatus" | "clearStatus">;
type Album = Pick<Awaited<ReturnType<typeof fetchUserAlbums>>["albums"][number], "id" | "songName" | "difficultyCode" | "level" | "takenAt" | "imageKey">;

export function GameRecentList({ game, plays }: { game: CanonicalGameId; plays: Recent[] }) {
  const t = useTranslations();
  const locale = useLocale();
  if (!plays.length) return <p className="py-4 text-muted-foreground">{t("recentPlays.noPlays")}</p>;
  return <ul className="divide-y">{plays.map(play => <li key={play.recentSongId.toString()} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
    <div><p className="font-medium">{play.songName}</p><p className="text-muted-foreground">{getGameDifficultyLabel(game, play.difficultyCode)} {play.level}</p><time dateTime={new Date(play.playedAt).toISOString()} className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(play.playedAt))} UTC</time></div>
    <div className="text-right"><p className="tabular-nums">{formatGameScore(game, play.scoreValue)}</p><p className="text-xs text-muted-foreground">{getGameStatusLabels(game, play).join(" · ")}</p></div>
  </li>)}</ul>;
}

export function GameAlbumList({ game, albums }: { game: CanonicalGameId; albums: Album[] }) {
  const t = useTranslations();
  const origin = process.env.NEXT_PUBLIC_R2_URL;
  if (!albums.length) return <p className="py-4 text-muted-foreground">{t("albums.noAlbums")}</p>;
  return <ul className="divide-y">{albums.map(album => <li key={album.id} className="py-4">
    <p className="text-sm font-medium">{album.songName}</p><p className="mb-2 text-xs text-muted-foreground">{getGameDifficultyLabel(game, album.difficultyCode)} {album.level} · {album.takenAt.slice(0, 10)}</p>
    {album.imageKey && origin ? <a href={`${origin}/${album.imageKey}`} target="_blank" rel="noopener noreferrer"><img src={`${origin}/${album.imageKey}`} alt={album.songName} loading="lazy" className="max-h-96 max-w-full rounded-md" /></a> : <p className="text-sm text-muted-foreground">{t("albums.imageUnavailable")}</p>}
  </li>)}</ul>;
}

function PageControls({ offset, hasMore, loading, onChange }: { offset: number; hasMore: boolean; loading: boolean; onChange: (offset: number) => void }) {
  const t = useTranslations();
  return <div className="mt-4 flex gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => onChange(Math.max(0, offset - 20))}>{t("common.previous")}</Button><Button variant="outline" disabled={loading || !hasMore} onClick={() => onChange(offset + 20)}>{t("common.next")}</Button></div>;
}

export function GameRecentPage({ region, beforeDate }: { region: Region; beforeDate: Date }) {
  const game = useGame();
  const t = useTranslations();
  const [offset, setOffset] = useState(0);
  const query = trpc.user.getRecentSongs.useQuery({ game: game.id, region, limit: 20, offset, beforeDate }, { enabled: game.enabled && game.capabilities.includes("recents"), refetchOnWindowFocus: false });
  return <div>{query.error ? <div role="alert"><p>{t("dataContent.loadError")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div> : query.isLoading ? <p role="status">{t("common.loading")}</p> : <GameRecentList game={game.id} plays={query.data?.recentPlays ?? []} />}<PageControls offset={offset} hasMore={query.data?.hasMore ?? false} loading={query.isFetching} onChange={setOffset} /></div>;
}

export function GameAlbumPage({ region }: { region: Region }) {
  const game = useGame();
  const t = useTranslations();
  const [offset, setOffset] = useState(0);
  const query = trpc.user.getUserAlbums.useQuery({ game: game.id, region, limit: 20, offset }, { enabled: game.enabled && game.capabilities.includes("albums"), refetchOnWindowFocus: false });
  return <div>{query.error ? <div role="alert"><p>{t("dataContent.loadError")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div> : query.isLoading ? <p role="status">{t("common.loading")}</p> : <GameAlbumList game={game.id} albums={query.data?.albums ?? []} />}<PageControls offset={offset} hasMore={query.data?.hasMore ?? false} loading={query.isFetching} onChange={setOffset} /></div>;
}

