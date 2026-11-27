import { NetEmpty, NetNote, NetSelect, NetTitle } from "@/components/net/kit";
import { NetPaywall } from "@/components/net/net-paywall";
import { NetRatingPlate } from "@/components/net/net-rating-plate";
import { NetRankMedal } from "@/components/net/ranking/net-rating-plate";
import styles from "@/components/net/ranking/ranking.module.css";
import { netUpdateDate } from "@/components/net/ranking/update-date";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

const GHOST_ROWS = 5;

export default async function NetRatingRankingPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("ranking")]);
  const { snapshotData } = player;
  const name = snapshotData?.snapshot.displayName ?? player.username;
  const plate = t("plateLabel");

  return (
    <>
      <NetTitle>{t("rating.title")}</NetTitle>
      <div className={styles.filters}>
        <NetSelect defaultValue="house" aria-label={t("rating.scope.house", { name })}>
          <option value="house">{t("rating.scope.house", { name })}</option>
          <option value="ex" disabled>{t("rating.scope.ex")}</option>
          <option value="national" disabled>{t("rating.scope.national")}</option>
          <option value="world" disabled>{t("rating.scope.world")}</option>
        </NetSelect>
        <p className={styles.filterNote}>{t("rating.note1")}<br />{t("rating.note2")}</p>
      </div>
      {!snapshotData ? (
        <NetEmpty>{t("rating.noSnapshot")}</NetEmpty>
      ) : (
        <>
          <div className={styles.current}>
            <div>{t("rating.current")}<br />{t("rating.currentNote")}</div>
            <NetRatingPlate rating={snapshotData.snapshot.rating} label={plate} />
          </div>
          <div className={styles.boardHead}>
            <h3>{t("rating.heading", { name })}</h3>
            <p>{t("rating.update", { date: netUpdateDate() })} / {t("rating.participants", { count: 1 })}</p>
            <span className={styles.rainbow} aria-hidden />
          </div>
          <div className={styles.row} data-podium>
            <NetRankMedal rank={1} />
            <span className={styles.rowName}>{name}<span className={styles.you}>{t("rating.you")}</span></span>
            <NetRatingPlate rating={snapshotData.snapshot.rating} label={plate} />
          </div>
          <NetPaywall feature={t("rating.paywall")} requires="premium">
            <div className={`${styles.row} ${styles.ghost}`}>{t("rating.ghost")}</div>
            {Array.from({ length: GHOST_ROWS }, (_, index) => (
              <div key={index} className={styles.row}>
                <NetRankMedal rank={index + 2} />
                <span className={styles.rowName}>？？？？？</span>
                <NetRatingPlate rating={0} label={plate} />
              </div>
            ))}
          </NetPaywall>
          <NetNote>{t("rating.victory")}</NetNote>
        </>
      )}
    </>
  );
}
