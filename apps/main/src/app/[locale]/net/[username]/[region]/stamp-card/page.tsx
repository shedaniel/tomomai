import { netSeed } from "@/components/net/collection/seed";
import { NetEmpty, NetInfo, NetNote, NetTitle } from "@/components/net/kit";
import { NET_STAMPS_PER_CARD, NetStampCard, type NetStampMotif } from "@/components/net/stamp-card/net-stamp-card";
import { NetSecretStampCard } from "@/components/net/stamp-card/net-secret-stamp-card";
import styles from "@/components/net/stamp-card/stamp-card.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

type StampCardSpec = { id: string; motif: NetStampMotif; count: number | null; per: number };

export default async function NetStampCardPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("stampCard");
  const snapshot = snapshotData?.snapshot;

  const earned: StampCardSpec[] = [
    { id: "plays", motif: "coin", count: snapshot?.totalPlayCount ?? null, per: 100 },
    { id: "version", motif: "note", count: snapshot?.versionPlayCount ?? null, per: 30 },
    { id: "scores", motif: "star", count: snapshotData ? snapshotData.songs.length : null, per: 50 },
  ];
  const cards = earned.map(card => {
    const filled = card.count === null
      ? netSeed(`${username}/${region}/${card.id}`) % (NET_STAMPS_PER_CARD + 1)
      : Math.min(NET_STAMPS_PER_CARD, Math.floor(card.count / card.per));
    const source = card.count === null ? t("madeUp") : t(`cards.${card.id}.source`, { count: card.count });
    return { id: card.id, motif: card.motif, filled, source };
  });
  // Login is forever one short, so the bonus card can never fill either.
  cards.push({ id: "login", motif: "key", filled: NET_STAMPS_PER_CARD - 1, source: t("cards.login.source") });
  cards.push({
    id: "bonus",
    motif: "heart",
    filled: cards.filter(card => card.filled >= NET_STAMPS_PER_CARD).length,
    source: t("cards.bonus.source"),
  });

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetInfo accent={t("subtitle")}>{t("intro")}</NetInfo>
      {!snapshotData && <NetEmpty>{t("noSnapshot")}</NetEmpty>}
      <div className={styles.summary}>
        <span>{t("total", { count: cards.reduce((sum, card) => sum + card.filled, 0) })}</span>
      </div>
      {cards.map(card => (
        <NetStampCard
          key={card.id}
          label={t(`cards.${card.id}.label`)}
          motif={card.motif}
          filled={card.filled}
          completeLabel={t("complete")}
          rewardLabel={t("reward")}
          source={card.source}
          filledLabel={t("filled", { count: card.filled })}
        />
      ))}
      <NetNote>{t("note")}</NetNote>
      <NetSecretStampCard />
    </>
  );
}
