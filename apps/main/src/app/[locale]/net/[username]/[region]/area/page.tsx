import Image from "next/image";
import styles from "@/components/net/area/area.module.css";
import { NetCartArt, NetLockArt } from "@/components/net/net-art";
import { NetButtonLink, NetEmpty, NetNote, NetTitle } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { useEventsCard as eventsCardFlag } from "@/lib/flags";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameEvent } from "@/lib/games/player-view";
import { isR2Url, resolveImageUrl } from "@/lib/images";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

export default async function NetAreaPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const player = await loadNetPlayer(username, region);
  const { game, profile, snapshotData, base } = player;
  const [t, common, eventsCard] = await Promise.all([getNetTranslations("area"), getNetTranslations("common"), eventsCardFlag()]);

  // Same rule as the profile's map tab.
  const visible = supportsGameFeature(game, "events", player.region) && profile.profileShowEvents && eventsCard;
  const areas = (snapshotData?.events ?? []).filter(event => event.eventType === "area" && event.name.trim() !== "");
  const detailsHref = `/profile/${encodeURIComponent(player.username)}/${player.region}?tab=map`;

  const nextLine = (area: GameEvent) => {
    if (area.state === "completed") return t("complete");
    if (area.state === "not_started") return t("notStarted");
    if (area.nextRewardDistance === null) return null;
    return <>{t("nextReward")}<b>{t("km", { distance: area.nextRewardDistance })}</b></>;
  };

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      {!visible || !snapshotData ? (
        <NetEmpty>{snapshotData ? t("hidden") : t("noSnapshot")}</NetEmpty>
      ) : (
        <>
          {areas.length === 0 && <NetEmpty>{t("empty")}</NetEmpty>}
          {areas.map(area => (
            <div key={area.name} className={styles.row}>
              <div className={styles.image}>
                <Image
                  src={resolveImageUrl(area.imageUrl)}
                  alt={area.name}
                  width={140}
                  height={140}
                  loading="lazy"
                  sizes="140px"
                  unoptimized={isR2Url(area.imageUrl)}
                />
              </div>
              <div className={styles.body}>
                <div className={styles.name}>{area.name}</div>
                <div className={styles.distance}>
                  <div className={styles.total}><em>{t("distance")}</em>{t("km", { distance: area.currentDistance })}</div>
                  <div className={styles.next}>{nextLine(area)}</div>
                </div>
                <div className={styles.details}><NetButtonLink href={detailsHref}>{common("details")}</NetButtonLink></div>
              </div>
            </div>
          ))}
        </>
      )}
      <div className={styles.row}>
        <div className={`${styles.image} ${styles.placeholder}`} aria-hidden><NetCartArt size={64} /></div>
        <div className={styles.body}>
          <div className={styles.name}>{t("locked.name")} <NetLockArt size={13} className={styles.lock} /></div>
          <div className={styles.distance}>
            <div className={styles.total}><em>{t("distance")}</em>{t("locked.distance")}</div>
            <div className={styles.next}>{t("locked.note")}</div>
          </div>
          <div className={styles.details}><NetButtonLink href={netPagePath(base, "shop")} tone="orange">{common("details")}</NetButtonLink></div>
        </div>
      </div>
      <NetNote>{t("note")}</NetNote>
    </>
  );
}
