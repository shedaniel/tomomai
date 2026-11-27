"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "../eggs/eggs";
import { NetButton } from "../kit";
import { NetSadMascot } from "../net-art";
import { purchaseNetTier, readSessionFlag, useNetTier, writeSessionFlag } from "./tier";
import styles from "./premium.module.css";

const DISMISSED_KEY = "tomomai-net-nudge-dismissed";
const OFFER_SECONDS = 30;
const PERKS = ["p1", "p2", "p3", "p4", "p5"] as const;
const DECLINES_KEY = "tomomai-net-nudge-declines";
const DECLINES_TO_GIVE_UP = 3;
const REMIND_MS = 8000;

function readDeclines(): number {
  try {
    return Number(window.localStorage.getItem(DECLINES_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeDeclines(count: number) {
  try {
    window.localStorage.setItem(DECLINES_KEY, String(count));
  } catch {
    // Without storage every session is the first no.
  }
}

/** The home page's pushy Premium offer. Declining takes two tries, then it leaves until the next session. The third session's no is final, sort of. */
export function NetPremiumNudge() {
  const t = useTranslations("net.premium.nudge");
  const tier = useNetTier();
  const [open, setOpen] = useState(false);
  const [sad, setSad] = useState(false);
  const [seconds, setSeconds] = useState(OFFER_SECONDS);
  const [extended, setExtended] = useState(0);
  const [declines, setDeclines] = useState(0);
  const [reminders, setReminders] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (tier === "premium" || readSessionFlag(DISMISSED_KEY)) return;
    const timer = window.setTimeout(() => {
      setDeclines(readDeclines());
      setOpen(true);
    }, reminders > 0 ? REMIND_MS : 900);
    return () => window.clearTimeout(timer);
  }, [tier, reminders]);

  useEffect(() => {
    if (!open) return;
    const tick = window.setInterval(() => {
      setSeconds(current => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [open]);

  const watching = open && !sad && !gaveUp;
  useEffect(() => {
    if (!open || seconds > 0) return;
    if (watching) findNetEgg("fakeUrgency");
    const timer = window.setTimeout(() => {
      setExtended(count => count + 1);
      setSeconds(OFFER_SECONDS);
    }, watching ? 1500 : 0);
    return () => window.clearTimeout(timer);
  }, [open, seconds, watching]);

  if (!open || tier === "premium") return null;

  const dismiss = () => {
    writeSessionFlag(DISMISSED_KEY);
    const count = readDeclines() + 1;
    writeDeclines(count);
    if (count === DECLINES_TO_GIVE_UP) {
      setGaveUp(true);
      findNetEgg("nudgeDecline");
      return;
    }
    setOpen(false);
  };
  const remindLater = () => {
    setOpen(false);
    setSad(false);
    setSeconds(OFFER_SECONDS);
    setReminders(count => count + 1);
  };
  const buy = () => {
    setOpen(false);
    purchaseNetTier("premium");
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={t("title")}>
      <div className={styles.nudge}>
        {gaveUp ? (
          <>
            <div className={styles.sad}>
              <div className={styles.sadFace}><NetSadMascot size={88} /></div>
              <div className={styles.sadTitle}>{t("final.title")}</div>
              <p className={styles.sadBody}><b>{t("final.aside")}</b> {t("final.body")}</p>
            </div>
            <div className={styles.nudgeActions}>
              <NetButton className={styles.big} onClick={() => setOpen(false)}>{t("final.close")}</NetButton>
            </div>
          </>
        ) : sad ? (
          <>
            <div className={styles.sad}>
              <div className={styles.sadFace}><NetSadMascot size={88} /></div>
              <div className={styles.sadTitle}>{t("sad.title")}</div>
              <p className={styles.sadBody}>{t("sad.body")}</p>
              {declines > 0 && <p className={styles.sadBody}>{t("sad.again", { count: declines })}</p>}
            </div>
            <div className={styles.nudgeActions}>
              <NetButton tone="orange" className={styles.big} onClick={buy}>{t("sad.buy")}</NetButton>
              <button type="button" className={styles.decline} onClick={remindLater}>{t("remind")}</button>
              <button type="button" className={styles.decline} onClick={dismiss}>{t("sad.decline")}</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className={styles.close} onClick={() => setSad(true)} aria-label={t("closeLabel")} />
            <div className={styles.nudgeHead}>
              <span className={styles.nudgeEyebrow}>{t(reminders > 0 ? "eyebrowReminder" : tier === "standard" ? "eyebrowUpgrade" : "eyebrow")}</span>
              <div className={styles.nudgeTitle}>{t("title")}</div>
              <div className={styles.price}><s>{t("oldPrice")}</s>{t("price")}<small>{t("perMonth")}</small></div>
              <div className={styles.timer}>
                {extended > 0 ? t("extended", { count: extended }) : t("endsIn")}
                <b>00:{String(seconds).padStart(2, "0")}</b>
              </div>
            </div>
            <ul className={styles.perks}>
              {PERKS.map(perk => <li key={perk}>{t(`perks.${perk}`)}</li>)}
            </ul>
            <div className={styles.nudgeActions}>
              <NetButton tone="orange" className={styles.big} onClick={buy}>{t("buy")}</NetButton>
              <button type="button" className={styles.decline} onClick={() => setSad(true)}>{t("decline")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
