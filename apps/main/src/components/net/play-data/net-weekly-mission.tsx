import { Check, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { NetTranslator } from "@/lib/net/messages";
import styles from "./play-data.module.css";

const MISSIONS = [
  { id: "login", color: "#2b6fe8", reward: 100, cleared: true },
  { id: "roast", color: "#2fa24c", reward: 200, cleared: false },
  { id: "shop", color: "#ff8a1a", reward: 400, cleared: false },
] as const;

function Reward({ amount, unit }: { amount: number; unit: string }) {
  return <span className={styles.reward}>{amount}<small>{unit}</small></span>;
}

/** The dark blue Weekly Mission box. Only the login mission is ever clear. */
export function NetWeeklyMission({ t, until, shopHref }: { t: NetTranslator; until: string; shopHref: string }) {
  const cleared = MISSIONS.filter(mission => mission.cleared).length;
  return (
    <div className={styles.mission}>
      <h5>{t("mission.title")}</h5>
      <div className={styles.until}>
        <span>{t("mission.until", { date: until })}</span>
        <b>{t("mission.clear", { count: cleared, total: MISSIONS.length })}</b>
      </div>
      {MISSIONS.map(mission => {
        const text = t(`mission.items.${mission.id}.text`);
        return (
          <div key={mission.id} className={styles.missionItem} style={{ ["--mission" as string]: mission.color }}>
            <span className={styles.missionLabel}>{t(`mission.items.${mission.id}.label`)}</span>
            <div className={styles.missionTask}>
              <Reward amount={mission.reward} unit={t("mission.reward")} />
              {mission.id === "shop" ? <Link href={shopHref}>{text}</Link> : <span>{text}</span>}
            </div>
            <div className={mission.cleared ? styles.missionDone : styles.missionLock}>
              <Reward amount={mission.reward * 2} unit={t("mission.reward")} />
              {mission.cleared ? <Check size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
              {mission.cleared ? t("mission.cleared") : t("mission.unlock")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
