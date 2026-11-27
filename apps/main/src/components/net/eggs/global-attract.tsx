"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { findNetEgg } from "./eggs";
import { NetEggBanner } from "./global-dialog";
import { netOverlayRoot } from "./global-judgement";
import styles from "./global.module.css";

const IDLE_MS = 60 * 1000;
const NUDGE_PX = 40;
const DEMO_LANES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 4, 2, 6, 1, 5, 3, 7];

/** After a minute of no input the cabinet goes into attract mode, like it does when nobody is playing. */
export function NetEggAttract() {
  const t = useTranslations("net.common.eggs.attract");
  const [phase, setPhase] = useState<"off" | "on" | "back">("off");

  useEffect(() => {
    if (phase === "on") return;
    let last = Date.now();
    const active = () => { last = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach(name => window.addEventListener(name, active, { passive: true }));
    const check = window.setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - last < IDLE_MS) return;
      setPhase("on");
    }, 1000);
    return () => {
      window.clearInterval(check);
      events.forEach(name => window.removeEventListener(name, active));
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "on") return;
    const wake = () => {
      setPhase("back");
      findNetEgg("idle");
    };
    let origin: { x: number; y: number } | null = null;
    const onMove = (event: PointerEvent) => {
      origin ??= { x: event.clientX, y: event.clientY };
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > NUDGE_PX) wake();
    };
    window.addEventListener("keydown", wake);
    window.addEventListener("wheel", wake, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
      window.removeEventListener("pointermove", onMove);
    };
  }, [phase]);

  if (phase === "back") {
    return (
      <NetEggBanner tag={t("backTag")} close={t("close")} onClose={() => setPhase("off")}>
        {t("back")}
      </NetEggBanner>
    );
  }
  if (phase !== "on") return null;

  return createPortal(
    // Dismissing on click, not pointerdown, keeps the waking tap from landing on the page underneath.
    <div
      className={styles.attract}
      role="dialog"
      aria-modal="true"
      aria-label={t("label")}
      onClick={() => {
        setPhase("back");
        findNetEgg("idle");
      }}
    >
      <div className={styles.attractDemo}>{t("demo")}</div>
      <div className={styles.attractLogo} aria-hidden>
        tomo<b>mai</b><span>NET</span>
      </div>
      <div className={styles.attractRing} aria-hidden>
        <div className={styles.attractScreen} />
        {Array.from({ length: 8 }, (_, lane) => (
          <span key={lane} className={styles.attractButton} style={{ "--lane": lane } as CSSProperties}>{lane + 1}</span>
        ))}
        {DEMO_LANES.map((lane, i) => (
          <span key={i} className={styles.attractNote} style={{ "--lane": lane, "--beat": i } as CSSProperties} />
        ))}
        {DEMO_LANES.map((lane, i) => (
          <span key={i} className={styles.attractHit} style={{ "--lane": lane, "--beat": i } as CSSProperties} />
        ))}
      </div>
      <div className={styles.attractInsert}>{t("insert")}</div>
      <div className={styles.attractPrice}>
        <span>{t("freePlay")}</span> <b>{t("price")}</b>
      </div>
      <div className={styles.attractCredit}>{t("credit")}</div>
      <div className={styles.attractHint}>{t("hint")}</div>
    </div>,
    netOverlayRoot(),
  );
}
