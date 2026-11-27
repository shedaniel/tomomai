import { netCircleCode } from "@/components/net/friends/friend-code";
import { NetAiMascot, NetBlankAvatar } from "@/components/net/friends/net-ai-mascot";
import { NetCircleButtons, NetLeaveCircleButton } from "@/components/net/friends/net-circle-actions";
import { bold } from "@/components/net/friends/bold";
import styles from "@/components/net/friends/friends.module.css";
import { NetEmpty, NetPanel, NetTitle } from "@/components/net/kit";
import { NetImage } from "@/components/net/net-image";
import { NetPaywall } from "@/components/net/net-paywall";
import { NetRankMedal } from "@/components/net/ranking/net-rating-plate";
import { netUpdateDate } from "@/components/net/ranking/update-date";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

const LOCKED_FESTA_ROWS = 7;

export default async function NetCirclePage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("friends")]);
  const snapshot = player.snapshotData?.snapshot;
  const name = snapshot?.displayName ?? player.username;
  const code = netCircleCode(player.username);
  const points = snapshot?.versionPlayCount ?? 0;

  const now = new Date();
  const month = now.toLocaleString(locale, { month: "long" });
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  return (
    <>
      <NetTitle>{t("circle.title")}</NetTitle>
      <section className={styles.circle}>
        <div className={styles.circleBanner}>{t("circle.banner")}</div>
        <div className={styles.circleGrid}>
          <div className={styles.circleMain}>
            <div className={styles.circleName}>{t("circle.name")}</div>
            <div className={styles.circleCode}>{t("circle.codeLabel")}<b>{code}</b></div>
            <div className={styles.circleMember}><em>{t("circle.member")}</em><span>{name}</span></div>
            <div className={styles.circleComment}>{t("circle.comment")}</div>
          </div>
          <div className={styles.circleSide}>
            <NetAiMascot size={96} />
            <div className={styles.bubble}>{t("circle.bubble")}</div>
            <div className={`${styles.tag} ${styles.tagYellow}`}>{t("circle.tagWelcome")}</div>
            <div className={`${styles.tag} ${styles.tagPink}`}>{t("circle.tagEnjoy")}</div>
          </div>
        </div>
      </section>
      <NetCircleButtons code={code} />

      <NetTitle>{t("circle.pointsTitle")}</NetTitle>
      {!snapshot && <NetEmpty>{t("circle.noSnapshot")}</NetEmpty>}
      <NetPanel>
        <div className={styles.points}>
          <h5>{t("circle.totalFor", { month })}</h5>
          <div><b>{points.toLocaleString(locale)}</b> {t("circle.pointsUnit")}</div>
        </div>
        <p className={styles.centered}>{t.rich("circle.reset", { days: daysLeft, b: bold })}</p>
        <p className={styles.centered}>{t("circle.pointsSource")}</p>
        <div className={styles.divider} />
        <div className={styles.rankBox}>
          <h5>{t("circle.rankFor", { month })}</h5>
          <div>{t.rich("circle.rank", { b: bold })}</div>
        </div>
        <p className={styles.centered}>{t("circle.rankNote")}</p>
        <p className={styles.update}>{t("circle.update", { date: netUpdateDate(now) })}</p>
      </NetPanel>
      <div className={styles.reward}>
        <div className={styles.rewardPill}>{t.rich("circle.nextReward", { b: bold })}</div>
        <div className={styles.rewardBubble}>
          <div>{t("circle.rewardsBubble")}</div>
          <NetAiMascot size={64} />
        </div>
      </div>
      <div className={styles.bigButtons}>
        <span>{t("circle.rewards")}</span>
        <span>{t("circle.ranking")}</span>
      </div>

      <NetTitle>{t("circle.membersTitle")}</NetTitle>
      <NetPanel>
        <div className={styles.member}>
          <div className={styles.memberIcon}>
            {snapshot?.iconUrl ? <NetImage src={snapshot.iconUrl} /> : <NetBlankAvatar size={56} />}
          </div>
          <div className={styles.memberBody}>
            <div className={styles.memberName}>{name}</div>
            <div className={styles.roles}>
              <span>{t("circle.leader")}</span>
              <span>{t("circle.alsoMember")}</span>
              <span>{t("circle.treasurer")}</span>
            </div>
          </div>
        </div>
        <NetLeaveCircleButton />
      </NetPanel>

      <NetTitle>{t("circle.festaTitle")}</NetTitle>
      <NetPanel>
        <p className={styles.centered}>{t("circle.festa")}</p>
        <div className={styles.festaRow}>
          <NetRankMedal rank={1} />
          <span>{t("circle.festaBoard")}</span>
          <span>{points.toLocaleString(locale)} {t("circle.pointsUnit")}</span>
        </div>
        <NetPaywall feature={t("circle.festaPaywall")}>
          {Array.from({ length: LOCKED_FESTA_ROWS }, (_, index) => (
            <div key={index} className={styles.festaRow}>
              <NetRankMedal rank={index + 2} />
              <span>？？？？？？</span>
              <span>0 {t("circle.pointsUnit")}</span>
            </div>
          ))}
        </NetPaywall>
      </NetPanel>
    </>
  );
}
