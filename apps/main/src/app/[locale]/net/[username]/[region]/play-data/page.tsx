import { NetEmpty, NetTitle } from "@/components/net/kit";
import { NetProfileCard } from "@/components/net/net-profile-card";
import { NetPlayDataGrid } from "@/components/net/play-data/net-play-data-grid";
import { NetWeeklyMission } from "@/components/net/play-data/net-weekly-mission";
import playDataStyles from "@/components/net/play-data/play-data.module.css";
import { summarizePlayData } from "@/components/net/play-data/summary";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { PUBLIC_VIEWS, toPublicStats } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";
import { fetchPlayerStats } from "@/server/queries/stats";

export const dynamic = "force-dynamic";

function nextSunday(locale: string) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
  return `${day} (${weekday}.)`;
}

export default async function NetPlayDataPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { game, profile, snapshotData, region: playerRegion, base } = await loadNetPlayer(username, region);
  const [t, session, currentLocale] = await Promise.all([getNetTranslations("playData"), getServerSession(), getLocale()]);
  // Same rule as the profile's Stats tab.
  const canSeeStats = session?.user.id === profile.id || PUBLIC_VIEWS.stats(profile);
  const isOwner = session?.user.id === profile.id;
  const summary = canSeeStats && snapshotData
    ? summarizePlayData(isOwner ? await fetchPlayerStats(game.id, profile.id, playerRegion) : toPublicStats(await fetchPlayerStats(game.id, profile.id, playerRegion), profile))
    : null;
  const playCount = (count: number | null) => count == null ? t("counts.hidden") : count.toLocaleString("en-US");

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      {snapshotData ? (
        <NetProfileCard snapshot={snapshotData.snapshot}>
          <div className={playDataStyles.counts}>
            {t("counts.version", { count: playCount(snapshotData.snapshot.versionPlayCount) })}<br />
            {t("counts.total", { count: playCount(snapshotData.snapshot.totalPlayCount) })}
          </div>
          {summary ? (
            <NetPlayDataGrid summary={summary} />
          ) : (
            <div className={playDataStyles.locked}>{t("locked.line1")}<br />{t("locked.line2")}</div>
          )}
        </NetProfileCard>
      ) : (
        <NetEmpty>{t("noSnapshot")}</NetEmpty>
      )}
      <NetTitle>{t("mission.heading")}</NetTitle>
      <NetWeeklyMission t={t} until={nextSunday(currentLocale)} shopHref={netPagePath(base, "shop")} />
    </>
  );
}
