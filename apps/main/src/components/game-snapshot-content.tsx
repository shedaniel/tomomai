"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tomomai/ui";
import type { FrontendGame } from "@/lib/games/frontend";
import { getPlayerRankings, type GamePlayerScore, type GameSnapshotData } from "@/lib/games/player-view";
import { formatGameRating, formatGameScore, getGameDifficultyLabel, getGameRankingBuckets, getGameStatusLabels } from "@/lib/games/presentation";

export function GameSnapshotContent({ game, data, showAllScores = true, showScoreDetails = true, showPlayCounts = true }: {
  game: FrontendGame;
  data: GameSnapshotData;
  showAllScores?: boolean;
  showScoreDetails?: boolean;
  showPlayCounts?: boolean;
}) {
  const t = useTranslations("multiGame");
  const locale = useLocale();
  const [view, setView] = useState<"rankings" | "songs">("rankings");
  const [search, setSearch] = useState("");
  const rankings = useMemo(() => getPlayerRankings(game.id, data), [game.id, data]);
  const hasRankings = game.capabilities.includes("rankings");
  const pendingViews = (["recents", "albums", "events"] as const).filter(capability => game.capabilities.includes(capability));
  const displayAll = showAllScores && (view === "songs" || !hasRankings);
  const visibleSongs = data.songs.filter(song => `${song.songName} ${song.artist}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));

  function scoreTable(scores: GamePlayerScore[], ranked = false) {
    return scores.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("noScores")}</p> : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>{ranked && <th scope="col" className="p-2">{t("rank")}</th>}<th scope="col" className="p-2">{t("song")}</th><th scope="col" className="p-2">{t("difficulty")}</th><th scope="col" className="p-2 text-right">{t("score")}</th>{showScoreDetails && <th scope="col" className="p-2">{t("status")}</th>}</tr>
          </thead>
          <tbody className="divide-y">
            {scores.map((song, index) => <tr key={song.songId}>
              {ranked && <td className="p-2 tabular-nums text-muted-foreground">{index + 1}</td>}
              <th scope="row" className="p-2 text-left font-medium"><span className="block">{song.songName}</span><span className="block text-xs font-normal text-muted-foreground">{song.artist}</span></th>
              <td className="p-2 whitespace-nowrap">{getGameDifficultyLabel(game.id, song.difficultyCode)} {song.level}</td>
              <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatGameScore(game.id, song.scoreValue)}</td>
              {showScoreDetails && <td className="p-2 text-xs">{getGameStatusLabels(game.id, song).join(" · ") || "—"}</td>}
            </tr>)}
          </tbody>
        </table>
      </div>
    );
  }

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div><h1 className="text-2xl font-semibold">{data.snapshot.displayName}</h1><p className="text-sm text-muted-foreground">{game.displayName} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(data.snapshot.fetchedAt))} UTC</p></div>
      <dl className="flex flex-wrap gap-6 text-sm">
        {game.capabilities.includes("rating") && <div><dt className="text-muted-foreground">{t("rating")}</dt><dd className="font-semibold tabular-nums">{formatGameRating(game.id, data.snapshot.rating)}</dd></div>}
        {showPlayCounts && data.snapshot.totalPlayCount != null && <div><dt className="text-muted-foreground">{t("playCount")}</dt><dd className="font-semibold tabular-nums">{data.snapshot.totalPlayCount.toLocaleString(locale)}</dd></div>}
      </dl>
    </div>
    {hasRankings && showAllScores && <div className="flex gap-2" role="group" aria-label={t("scoreView")}>
      <Button variant={displayAll ? "outline" : "default"} onClick={() => setView("rankings")} aria-pressed={!displayAll}>{t("rankings")}</Button>
      <Button variant={displayAll ? "default" : "outline"} onClick={() => setView("songs")} aria-pressed={displayAll}>{t("allScores")}</Button>
    </div>}
    {displayAll ? <div className="space-y-4">
      <label className="block text-sm"><span className="mb-1 block">{t("searchSongs")}</span><input value={search} onChange={event => setSearch(event.target.value)} className="w-full max-w-md rounded-md border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="search" /></label>
      {scoreTable(visibleSongs)}
    </div> : hasRankings ? getGameRankingBuckets(game.id).map(bucket => <section key={bucket.key} aria-labelledby={`ranking-${bucket.key}`}>
      <h2 id={`ranking-${bucket.key}`} className="mb-2 text-lg font-semibold">{bucket.label}</h2>
      {scoreTable(bucket.key === "new" ? rankings.newScores : rankings.oldScores, true)}
    </section>) : <p className="text-sm text-muted-foreground">{t("noScores")}</p>}
    {pendingViews.length > 0 && <p className="text-sm text-muted-foreground">{t("optionalViewsPending", { features: pendingViews.map(feature => t(feature)).join(", ") })}</p>}
  </section>;
}
