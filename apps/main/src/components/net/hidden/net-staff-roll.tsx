"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "../eggs/eggs";
import styles from "./hidden.module.css";

const ROLES = ["director", "designer", "ratings", "inflation", "button", "queue", "card", "maintenance", "slides", "gloves", "money"] as const;
const THANKS = ["error", "wrist", "utage", "region", "break", "two"] as const;

/** End credits that roll up once. The secret counts when the last line reaches the screen. */
export function NetStaffRoll({ starring }: { starring: string }) {
  const t = useTranslations("net.home.hidden.credits");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const end = endRef.current;
    if (!end || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        findNetEgg("credits");
        observer.disconnect();
      }
    }, { threshold: 1 });
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.rollFrame}>
      <div className={styles.roll} onAnimationEnd={() => findNetEgg("credits")}>
        <div className={styles.rollHeading}>{t("heading")}</div>
        <div className={styles.credit}>
          <div className={styles.role}>{t("starring")}</div>
          <div className={styles.starring}>{starring}</div>
        </div>
        {ROLES.map(key => (
          <div key={key} className={styles.credit}>
            <div className={styles.role}>{t(`roles.${key}.role`)}</div>
            <div className={styles.name}>{t(`roles.${key}.name`)}</div>
          </div>
        ))}
        <div className={styles.thanks}>
          <div className={styles.role}>{t("thanksTitle")}</div>
          <ul>{THANKS.map(key => <li key={key}>{t(`thanks.${key}`)}</li>)}</ul>
        </div>
        <div className={styles.rollEnd}>
          <b>{t("end")}</b>
          <span ref={endRef}>{t("endSub")}</span>
          <small>{t("track")}</small>
        </div>
      </div>
    </div>
  );
}
