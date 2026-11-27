import { NetEmpty, NetInfo, NetNote, NetSection, NetTitle } from "@/components/net/kit";
import { NetMusicRow } from "@/components/net/net-music-row";
import { NetPaywall } from "@/components/net/net-paywall";
import { NetProfileCard } from "@/components/net/net-profile-card";
import type { NetChartScore } from "@/components/net/score";
import { parentPublicIdOf } from "@tomomai/games/song-ids";
import { setStaticLocale } from "@/i18n/locale-server";
import { getPlayerRankings, type GamePlayerScore } from "@/lib/games/player-view";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netSongDetailPath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const FREE_ROWS = 3;

type RatedScore = GamePlayerScore & { rating: number };

function toRow(score: RatedScore): NetChartScore {
  return {
    songName: score.songName,
    level: score.level,
    difficultyCode: score.difficultyCode,
    typeCode: score.typeCode,
    scoreValue: score.scoreValue,
    secondaryScore: null,
  };
}

function RatingList({ scores, feature, empty, base }: { scores: RatedScore[]; feature: string; empty: string; base: string }) {
  if (scores.length === 0) return <NetEmpty>{empty}</NetEmpty>;
  const rows = scores.map((score, index) => (
    <NetMusicRow
      key={`${score.songId}-${index}`}
      score={toRow(score)}
      extra={score.rating}
      showStatus={false}
      href={netSongDetailPath(base, parentPublicIdOf(score.songId))}
    />
  ));
  return (
    <>
      {rows.slice(0, FREE_ROWS)}
      {rows.length > FREE_ROWS && <NetPaywall feature={feature}>{rows.slice(FREE_ROWS)}</NetPaywall>}
    </>
  );
}

const sum = (scores: RatedScore[]) => scores.reduce((total, score) => total + score.rating, 0);

export default async function NetRatingPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("rating");

  if (!snapshotData) {
    return (
      <>
        <NetInfo accent={t("infoAccent")}>{t("info")}</NetInfo>
        <NetEmpty>{t("noSnapshot")}</NetEmpty>
      </>
    );
  }

  const { newScores, oldScores } = getPlayerRankings("maimai", snapshotData);
  const newTotal = sum(newScores);
  const oldTotal = sum(oldScores);

  return (
    <>
      <NetInfo accent={t("infoAccent")}>{t("info")}</NetInfo>
      <NetTitle>{t("playersData")}</NetTitle>
      <NetProfileCard snapshot={snapshotData.snapshot} />
      <NetSection>{t("newSongs")}</NetSection>
      <RatingList scores={newScores} feature={t("paywallNew", { count: newScores.length })} empty={t("empty")} base={base} />
      <NetSection>{t("oldSongs")}</NetSection>
      <RatingList scores={oldScores} feature={t("paywallOld", { count: oldScores.length })} empty={t("empty")} base={base} />
      <NetNote>{t("total", { newTotal, oldTotal, total: newTotal + oldTotal })}</NetNote>
    </>
  );
}
