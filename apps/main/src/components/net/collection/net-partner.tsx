import { NetLockArt, NetStarArt } from "../net-art";
import { NetTomomaiAi } from "./collection-art";
import styles from "./partner.module.css";

/** The heart meter under the current partner. Affection is always full, and full only means "tolerates you". */
export function NetPartnerAffection({ points, levelLabel, stageLabel, stages, quote }: {
  points: string;
  levelLabel: string;
  stageLabel: string;
  stages: readonly string[];
  quote: string;
}) {
  return (
    <div className={styles.affection}>
      <div className={styles.meterRow}>
        <span className={styles.level}>{levelLabel}</span>
        <div className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100} aria-label={stageLabel}>
          <svg className={styles.heart} viewBox="0 0 24 24" aria-hidden>
            <path d="M12 20.5s-8-5.2-8-11a4.4 4.4 0 0 1 8-2.6 4.4 4.4 0 0 1 8 2.6c0 5.8-8 11-8 11z" fill="#ff5a7a" stroke="#fff" strokeWidth={2} />
          </svg>
          <b>{points}</b>
        </div>
      </div>
      <ol className={styles.stages}>
        {stages.map(stage => <li key={stage}>{stage}</li>)}
      </ol>
      <div className={styles.stageNow}>{stageLabel}</div>
      <p className={styles.quote}>{quote}</p>
    </div>
  );
}

/** Tour member formation in the style of DX NET: tomomai AI leads, the other four seats are for sale. */
export function NetPartnerFormation({ heading, leader, level, stars, lockedLabel }: {
  heading: string;
  leader: string;
  level: string;
  stars: number;
  lockedLabel: string;
}) {
  return (
    <section className={styles.formation}>
      <h5 className={styles.heading}>{heading}</h5>
      <div className={styles.members}>
        <div className={styles.member}>
          <span className={styles.leader}>{leader}</span>
          <span className={styles.stars}><NetStarArt size={14} />{stars}</span>
          <span className={styles.face}><svg viewBox="0 0 64 64" aria-hidden><NetTomomaiAi /></svg></span>
          <span className={styles.lv}>{level}</span>
        </div>
        {[1, 2, 3, 4].map(slot => (
          <div key={slot} className={styles.member}>
            <span className={`${styles.face} ${styles.faceLocked}`}><NetLockArt size={26} /></span>
            <span className={`${styles.lv} ${styles.lvLocked}`}>{lockedLabel}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
