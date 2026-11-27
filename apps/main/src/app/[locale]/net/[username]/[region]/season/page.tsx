import styles from "@/components/net/event/event.module.css";
import { NetNote, NetPanel, NetSection, NetTitle } from "@/components/net/kit";
import { NetPaywall } from "@/components/net/net-paywall";
import { setStaticLocale } from "@/i18n/locale-server";
import { maimaiVersionTable } from "@/lib/games/maimai/versions";
import { getNetTranslations, type NetTranslator } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TIERS = 10;
const PLAYS_PER_TIER = 50;

function Track({ kind, reached, t }: { kind: "free" | "premium"; reached: number; t: NetTranslator }) {
  return (
    <NetPanel className={styles.track}>
      <h4 className={cn(styles.trackHead, kind === "premium" && styles.premiumHead)}>{t(`season.${kind}`)}</h4>
      <ol className={styles.tiers}>
        {Array.from({ length: TIERS }, (_, index) => {
          const tier = index + 1;
          const claimed = tier <= reached;
          return (
            <li key={tier} className={cn(styles.tier, !claimed && styles.tierDim)}>
              <span className={styles.tierNumber}>{t("season.tier", { tier })}</span>
              <span className={styles.tierReward}>{t(`season.rewards.${kind}${tier}`)}</span>
              <span className={cn(styles.tierState, claimed && styles.tierClaimed)}>{t(claimed ? "season.claimed" : "season.locked")}</span>
            </li>
          );
        })}
      </ol>
    </NetPanel>
  );
}

export default async function NetSeasonPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("event");

  if (!snapshotData) {
    return <><NetTitle>{t("season.title")}</NetTitle><NetSection>{t("season.noSnapshot")}</NetSection></>;
  }

  const version = maimaiVersionTable.get(snapshotData.snapshot.gameVersion);
  const plays = snapshotData.snapshot.versionPlayCount ?? 0;
  const reached = Math.min(TIERS, Math.floor(plays / PLAYS_PER_TIER));
  const progress = reached === TIERS ? 100 : (plays % PLAYS_PER_TIER) / PLAYS_PER_TIER * 100;

  return (
    <>
      <NetTitle>{t("season.title")}</NetTitle>
      <NetSection>{t("season.opening")}</NetSection>
      <NetPanel heading={t("season.current")}>
        <div className={styles.seasonName}>{version ? t("season.seasonName", { version: version.name }) : t("season.noVersion")}</div>
        <div className={styles.passLevel}><em>{t("season.level")}</em><b>{reached}</b></div>
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.xp}>
          {t("season.xp", { plays })}<br />
          {reached === TIERS ? t("season.maxed") : t("season.nextTier", { plays: PLAYS_PER_TIER - (plays % PLAYS_PER_TIER) })}
        </div>
      </NetPanel>
      <Track kind="free" reached={reached} t={t} />
      <NetPaywall feature={t("season.premiumFeature")} requires="premium">
        <Track kind="premium" reached={reached} t={t} />
      </NetPaywall>
      <NetNote>{t("season.note")}</NetNote>
    </>
  );
}
