"use client";

import { useTranslations } from "next-intl";
import { useGame } from "@/components/providers/game-provider";
import { getGameBrand } from "@/lib/games/frontend";

export function GameUnavailable() {
  const game = useGame();
  const t = useTranslations();
  return (
    <main className="container mx-auto max-w-[1300px] space-y-4 px-3 py-8 md:px-6 lg:px-12">
      <h1 className="text-2xl font-semibold">{getGameBrand(game).title}</h1>
      <p className="max-w-prose text-muted-foreground" role="status">
        {t("settings.pages.fetch.unavailable", { game: game.displayName })}
      </p>
    </main>
  );
}
