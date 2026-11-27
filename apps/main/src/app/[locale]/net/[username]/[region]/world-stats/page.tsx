import { NetEmpty, NetTitle } from "@/components/net/kit";
import type { WorldScore } from "@/components/net/world-stats/metrics";
import { NetWorldStats } from "@/components/net/world-stats/net-world-stats";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetWorldStatsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [{ profile, snapshotData }, session, t] = await Promise.all([
    loadNetPlayer(username, region),
    getServerSession(),
    getNetTranslations("worldStats"),
  ]);
  // Same rule as the profile's Stats tab, since every rate reads every score.
  const visible = session?.user.id === profile.id || PUBLIC_VIEWS.stats(profile);

  if (!snapshotData || !visible) {
    return <><NetTitle>{t("title")}</NetTitle><NetEmpty>{snapshotData ? t("hidden") : t("noSnapshot")}</NetEmpty></>;
  }

  const scores: WorldScore[] = snapshotData.songs.map(score => ({
    songName: score.songName,
    cover: score.cover,
    level: score.level,
    levelPrecise: score.levelPrecise,
    difficultyCode: score.difficultyCode,
    typeCode: score.typeCode,
    scoreValue: score.scoreValue,
    secondaryScore: score.secondaryScore,
    comboStatus: score.comboStatus,
    syncStatus: score.syncStatus,
  }));

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetWorldStats scores={scores} />
    </>
  );
}
