"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { findNetEgg } from "./eggs";
import { useNetJudgement, type NetJudgementGrade } from "./global-judgement";
import styles from "./global.module.css";

const LOGO_CLICKS = 7;

/** Counts clicks that come in quick succession. Only the first of a streak navigates. */
function useClickStreak(windowMs: number) {
  const streak = useRef({ count: 0, at: 0 });
  return (event: MouseEvent) => {
    const now = Date.now();
    const current = streak.current;
    current.count = now - current.at < windowMs ? current.count + 1 : 1;
    current.at = now;
    if (current.count > 1) event.preventDefault();
    return current.count;
  };
}

export function NetEggLogo({ href, className, label, children }: { href: string; className: string; label: string; children: ReactNode }) {
  const t = useTranslations("net.common.eggs.logo");
  const [fallen, setFallen] = useState(false);
  const click = useClickStreak(2000);

  return (
    <>
      <Link
        href={href}
        className={cn(className, fallen && styles.logoFallen)}
        aria-label={label}
        onClick={event => {
          if (fallen) return;
          if (click(event) >= LOGO_CLICKS) {
            setFallen(true);
            findNetEgg("logo");
          }
        }}
      >
        {children}
      </Link>
      {fallen && (
        <div className={styles.logoNote} role="status"><b>{t("note")}</b>{t("hint")}</div>
      )}
    </>
  );
}

const HOLD_MS = 1500;
const TAP_MS = 250;
const FLY_DELAY_MS = 650;

/** The options gear. A tap opens options. A held press is a TOUCH HOLD, and a perfect one launches the gear. */
export function NetEggGear({ href, className, label, children }: { href: string; className: string; label: string; children: ReactNode }) {
  const t = useTranslations("net.common.eggs.gear");
  const [holding, setHolding] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [gone, setGone] = useState(false);
  const [judgement, judge] = useNetJudgement();
  const hold = useRef<{ at: number; timer: number } | null>(null);
  const swallowClick = useRef(false);
  const self = useRef<HTMLAnchorElement>(null);

  useEffect(() => () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
  }, []);

  useEffect(() => {
    if (!cleared) return;
    const timer = window.setTimeout(() => {
      setGone(true);
      findNetEgg("gear");
    }, FLY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [cleared]);

  const judgeAtGear = (grade: NetJudgementGrade) => {
    const box = self.current?.getBoundingClientRect();
    judge({ grade, label: t("hold"), x: box ? box.left + box.width / 2 : undefined, y: box ? box.bottom + 34 : undefined });
  };

  const start = (event: PointerEvent<HTMLAnchorElement>) => {
    if (cleared || event.button !== 0 || hold.current) return;
    setHolding(true);
    hold.current = {
      at: Date.now(),
      timer: window.setTimeout(() => {
        hold.current = null;
        swallowClick.current = true;
        setHolding(false);
        setCleared(true);
        judgeAtGear("criticalPerfect");
      }, HOLD_MS),
    };
  };

  const release = () => {
    const current = hold.current;
    if (!current) return;
    hold.current = null;
    window.clearTimeout(current.timer);
    setHolding(false);
    const held = Date.now() - current.at;
    if (held < TAP_MS) return;
    swallowClick.current = true;
    judgeAtGear(held >= HOLD_MS / 2 ? "good" : "miss");
  };

  return (
    <>
      <Link
        ref={self}
        href={href}
        className={cn(className, styles.gearHold, holding && styles.gearHolding, gone && styles.gearGone)}
        aria-label={label}
        aria-hidden={gone || undefined}
        tabIndex={gone ? -1 : undefined}
        draggable={false}
        onPointerDown={start}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={event => { if (holding || cleared) event.preventDefault(); }}
        onClick={event => {
          if (gone || cleared || swallowClick.current) {
            swallowClick.current = false;
            event.preventDefault();
          }
        }}
      >
        {children}
        {holding && (
          <svg className={styles.holdRing} viewBox="0 0 60 60" aria-hidden>
            <circle cx="30" cy="30" r="26" className={styles.holdTrack} />
            {HOLD_COLORS.map((color, i) => (
              <circle
                key={color}
                cx="30"
                cy="30"
                r="26"
                pathLength={100}
                className={styles.holdArc}
                style={{ stroke: color, rotate: `${i * 90 - 90}deg`, animationDelay: `${(i * HOLD_MS) / 4}ms` } as CSSProperties}
              />
            ))}
          </svg>
        )}
      </Link>
      {judgement}
      {gone && <div className={styles.gearNote} role="status">{t("note")}</div>}
    </>
  );
}

const HOLD_COLORS = ["#ff3f6c", "#ffc21f", "#5fd35f", "#3fbcff"];
