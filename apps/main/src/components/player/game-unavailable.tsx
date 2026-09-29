"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useGame } from "@/components/providers/game-provider";
import { brandTitle, supportsGameFeature } from "@/lib/games/frontend";

export function GameUnavailable() {
  const game = useGame();
  const t = useTranslations();
  return (
    <main className="container mx-auto max-w-[1300px] space-y-4 px-3 py-8 md:px-6 lg:px-12">
      <h1 className="text-2xl font-semibold">{brandTitle(game.brand)}</h1>
      <p className="max-w-prose text-muted-foreground" role="status">
        {t("settings.pages.fetch.unavailable", { game: game.brand.displayName })}
      </p>
      {supportsGameFeature(game, "catalog") && <Link href="/db/songs" className="inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">{t("db.songs.heading")}</Link>}
    </main>
  );
}
