import { notFound } from "next/navigation";
import { NetButtonLink, NetEmpty, NetInfo, NetTitle } from "@/components/net/kit";
import { NetRecordCard } from "@/components/net/net-record-card";
import { NetPlayTime } from "@/components/net/records/net-play-time";
import { analyzeRecord } from "@/components/net/record-detail/analysis";
import { NetRecordDetail } from "@/components/net/record-detail/net-record-detail";
import styles from "@/components/net/record-detail/record-detail.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { hasCapability } from "@/lib/games/access";
import { calculateDXStars } from "@/lib/games/maimai/score-details";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer } from "@/lib/net/player";
import { fetchNetRecordDetail } from "@/lib/net/record-detail";
import { netPagePath, netSongDetailPath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; username: string; region: string; id: string }> };

export default async function NetRecordDetailPage({ params }: Params) {
  const { locale, username, region, id } = await params;
  await setStaticLocale(locale);
  const [player, session, t] = await Promise.all([
    loadNetPlayer(username, region),
    getServerSession(),
    getNetTranslations("recordDetail"),
  ]);
  const { game, profile, snapshotData } = player;
  if (!hasCapability(game.id, "recents", player.region)) notFound();
  const backHref = netPagePath(player.base, "records");

  if (session?.user.id !== profile.id && !PUBLIC_VIEWS.recentPlays(profile)) {
    return (
      <>
        <NetTitle>{t("title")}</NetTitle>
        <NetInfo accent={t("hidden.accent")}>{t("hidden.body")}</NetInfo>
        <NetEmpty>{t("notFound")}</NetEmpty>
        <div className={styles.actions}>
          <NetButtonLink href={backHref} tone="orange">{t("back")}</NetButtonLink>
        </div>
      </>
    );
  }

  // Same cut-off as the Game Record list, so a play it hides cannot be opened by id.
  const play = await fetchNetRecordDetail(profile.id, player.region, id, snapshotData?.snapshot.fetchedAt);
  if (!play) notFound();

  const maxDxScore = play.maxSecondaryScore ?? 0;
  const stars = maxDxScore > 0 ? calculateDXStars(play.secondaryScore, maxDxScore) : 0;
  const analysis = play.playlog ? analyzeRecord(play.playlog, play.scoreValue) : null;

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetRecordCard
        score={{
          songName: play.songName, cover: play.cover, level: play.level, difficultyCode: play.difficultyCode, typeCode: play.typeCode,
          scoreValue: play.scoreValue, secondaryScore: play.secondaryScore, comboStatus: play.comboStatus, syncStatus: play.syncStatus,
        }}
        track={t("track", { track: String(play.track).padStart(2, "0") })}
        playedAt={<NetPlayTime at={play.playedAt} />}
        maxDxScore={maxDxScore || null}
      />
      <NetRecordDetail
        playlog={play.playlog}
        analysis={analysis}
        dxScore={play.secondaryScore}
        maxDxScore={maxDxScore}
        stars={stars}
        backHref={backHref}
        songHref={netSongDetailPath(player.base, play.parentPublicId)}
      />
    </>
  );
}
