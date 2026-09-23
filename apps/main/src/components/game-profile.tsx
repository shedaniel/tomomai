"use client";

import { useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { useGame } from "@/components/providers/game-provider";
import { GameSnapshotContent } from "@/components/game-snapshot-content";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { Region } from "@/lib/types";

export function GameProfile({ username, region, snapshotData, showAllScores, showScoreDetails, showPlayCounts }: {
  username: string;
  region: Region;
  snapshotData: GameSnapshotData | null;
  showAllScores?: boolean;
  showScoreDetails?: boolean;
  showPlayCounts?: boolean;
}) {
  const game = useGame();
  const t = useTranslations("multiGame");
  return <div className="container mx-auto max-w-[1300px] px-3 md:px-6 lg:px-12 py-8">
    <Header currentTab="dashboard" showDiscordBanner={false} />
    <p className="mb-4 text-sm text-muted-foreground">@{username} · {region.toUpperCase()}</p>
    {snapshotData ? <GameSnapshotContent game={game} data={snapshotData} showAllScores={showAllScores} showScoreDetails={showScoreDetails} showPlayCounts={showPlayCounts} />
      : <p className="py-12 text-center text-muted-foreground">{t("noSnapshots", { game: game.displayName })}</p>}
  </div>;
}
