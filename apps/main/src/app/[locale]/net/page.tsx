import { redirect } from "@/i18n/navigation";
import { getLocale } from "@/i18n/locale-server";
import { NetPanel, NetTitle } from "@/components/net/kit";
import { NetPlayerPicker } from "@/components/net/net-player-picker";
import shell from "@/components/net/shell.module.css";
import { getServerSession } from "@/lib/auth-server";
import { getCurrentGame } from "@/lib/games/current";
import { getGameRegion } from "@/lib/games/frontend";
import { getNetTranslations } from "@/lib/net/messages";
import { netBasePath } from "@/lib/net/routes";
import { createServerSideTRPC } from "@/lib/trpc-server";

export const dynamic = "force-dynamic";

/** Opens the signed-in player's own DX NET, or asks whose to open. */
export default async function NetIndexPage() {
  const game = getCurrentGame();
  const session = await getServerSession();
  if (session) {
    const user = await (await createServerSideTRPC(session)).user.getUserData().catch(() => null);
    const region = getGameRegion(game, user?.region);
    if (user?.username && region) {
      redirect({ href: netBasePath(user.username, region), locale: await getLocale() });
    }
  }

  const t = await getNetTranslations("common");
  return (
    <div className={shell.stage}>
      <div className={shell.column} style={{ paddingTop: 40 }}>
        <NetTitle>{t("pickPlayer.title")}</NetTitle>
        <NetPanel heading={t("pickPlayer.body")}>
          <NetPlayerPicker regions={game.regions} defaultRegion={game.regions[0] ?? "intl"} />
        </NetPanel>
      </div>
    </div>
  );
}
