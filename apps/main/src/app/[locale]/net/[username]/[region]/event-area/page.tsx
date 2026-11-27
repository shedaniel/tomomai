import Image from "next/image";
import areaStyles from "@/components/net/area/area.module.css";
import styles from "@/components/net/event/event.module.css";
import { NetButtonLink, NetEmpty, NetNote, NetTitle } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { useEventsCard as eventsCardFlag } from "@/lib/flags";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameEvent } from "@/lib/games/player-view";
import { isR2Url, resolveImageUrl } from "@/lib/images";
import { getNetTranslations, type NetTranslator } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// DX NET prints event periods in JST for every region.
const PERIOD_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Open-ended events first, then the ones ending latest. */
function splitByEnd(events: readonly GameEvent[]) {
  const now = Date.now();
  const endOf = (event: GameEvent) => toDate(event.eventPeriodEnd)?.getTime() ?? Infinity;
  const sorted = [...events].sort((a, b) => (endOf(b) - endOf(a)) || 0);
  return { ongoing: sorted.filter(event => endOf(event) >= now), ended: sorted.filter(event => endOf(event) < now) };
}

function EventEntry({ event, ended, t, detailsHref, detailsLabel }: {
  event: GameEvent; ended: boolean; t: NetTranslator; detailsHref: string; detailsLabel: string;
}) {
  const start = toDate(event.eventPeriodStart);
  const end = toDate(event.eventPeriodEnd);
  const next = event.state === "not_started"
    ? t("eventArea.firstPlay")
    : <>{t("eventArea.nextReward")}<b>{event.nextRewardDistance === null ? t("eventArea.nextRewardDone") : t("eventArea.km", { distance: event.nextRewardDistance })}</b></>;
  return (
    <div className={styles.entry}>
      <div className={styles.head}>
        {event.state === "completed" && <span className={styles.complete}>{t("eventArea.complete")}</span>}
        <div className={areaStyles.name}>{event.name}</div>
      </div>
      <div className={styles.period}>
        {start && end ? t("eventArea.period", { start: PERIOD_FORMAT.format(start), end: PERIOD_FORMAT.format(end) }) : t("eventArea.periodOpen")}
      </div>
      <div className={styles.row}>
        <div className={cn(styles.banner, ended && styles.endedArt)}>
          {event.imageUrl && (
            <Image
              src={resolveImageUrl(event.imageUrl)}
              alt={event.name}
              width={360}
              height={144}
              loading="lazy"
              sizes="180px"
              unoptimized={isR2Url(event.imageUrl)}
            />
          )}
        </div>
        <div className={styles.body}>
          <div className={areaStyles.distance}>
            <div className={areaStyles.total}><em>{t("eventArea.distance")}</em>{t("eventArea.km", { distance: event.currentDistance })}</div>
            <div className={areaStyles.next}>{next}</div>
          </div>
          <div className={areaStyles.details}><NetButtonLink href={detailsHref}>{detailsLabel}</NetButtonLink></div>
        </div>
      </div>
    </div>
  );
}

export default async function NetEventAreaPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const player = await loadNetPlayer(username, region);
  const { game, profile, snapshotData } = player;
  const [t, common, eventsCard] = await Promise.all([getNetTranslations("event"), getNetTranslations("common"), eventsCardFlag()]);

  // Same rule as the profile's map tab and the AREA page.
  const visible = supportsGameFeature(game, "events", player.region) && profile.profileShowEvents && eventsCard;
  const events = (snapshotData?.events ?? []).filter(event => event.eventType === "eventArea" && event.name.trim() !== "");
  const { ongoing, ended } = splitByEnd(events);
  const detailsHref = `/profile/${encodeURIComponent(player.username)}/${player.region}?tab=map`;
  const entry = (event: GameEvent, isOver: boolean) => (
    <EventEntry key={event.name} event={event} ended={isOver} t={t} detailsHref={detailsHref} detailsLabel={common("details")} />
  );

  return (
    <>
      <NetTitle>{t("eventArea.title")}</NetTitle>
      {!visible || !snapshotData ? (
        <NetEmpty>{snapshotData ? t("eventArea.hidden") : t("eventArea.noSnapshot")}</NetEmpty>
      ) : (
        <>
          <div className={styles.group}>{t("eventArea.ongoing")}</div>
          {ongoing.length === 0 ? <NetEmpty>{t("eventArea.emptyOngoing")}</NetEmpty> : ongoing.map(event => entry(event, false))}
          <div className={cn(styles.group, styles.ended)}>{t("eventArea.ended")}</div>
          {ended.length === 0 ? <NetEmpty>{t("eventArea.emptyEnded")}</NetEmpty> : ended.map(event => entry(event, true))}
        </>
      )}
      <NetNote>{t("eventArea.note")}</NetNote>
    </>
  );
}
