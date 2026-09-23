"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tomomai/ui";
import { Header } from "@/components/header";
import { useGame } from "@/components/providers/game-provider";
import { GameSnapshotContent } from "@/components/game-snapshot-content";
import { useGameSnapshots } from "@/hooks/useGameSnapshots";
import type { GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region, User } from "@/lib/types";

export function GameDashboard({ user, region, initialSnapshots, initialSnapshotData }: {
  user: User;
  region: Region;
  initialSnapshots: GameSnapshotSummary[];
  initialSnapshotData?: GameSnapshotData | null;
}) {
  const game = useGame();
  const t = useTranslations("multiGame");
  const { snapshots, selectedSnapshot, setSelectedSnapshot, data, isLoading, error, refresh } = useGameSnapshots(region, initialSnapshots, initialSnapshotData);
  return <div className="container mx-auto max-w-[1300px] px-3 md:px-6 lg:px-12 py-8">
    <Header currentTab="dashboard" showDiscordBanner={false} user={{ user, menu: null }} />
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground" role="status">{t("fetchUnavailable", { game: game.displayName })}</p>
      {snapshots.length > 0 && <label className="block text-sm"><span className="mb-1 block">{t("snapshot")}</span>
        <select value={selectedSnapshot ?? ""} onChange={event => setSelectedSnapshot(event.target.value)} className="max-w-full rounded-md border bg-background px-3 py-2">
          {snapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.fetchedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</option>)}
        </select>
      </label>}
      {error ? <div role="alert" className="space-y-3"><p>{t("loadError")}</p><Button onClick={refresh}>{t("retry")}</Button></div>
        : isLoading ? <div role="status" aria-label={t("loading")} className="h-48 animate-pulse rounded-lg bg-muted" />
        : data ? <GameSnapshotContent game={game} data={data} />
        : <p className="py-12 text-center text-muted-foreground">{t("noSnapshots", { game: game.displayName })}</p>}
    </div>
  </div>;
}
