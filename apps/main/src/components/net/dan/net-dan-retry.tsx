"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { findNetEgg } from "../eggs/eggs";
import { NetButton, NetPanel } from "../kit";
import styles from "./dan.module.css";

const MAX_LIFE = 300;
const TRACKS = 4;
const RUN_MS = 2600;
const CLEAR_ON = 3;
const EXCUSES = 5;

type Run = { finalTrack: number; finalLife: number; excuse: number | null };
type Phase = "failed" | "playing" | "cleared";

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The fake 宴皆伝 course. Two more failures, then a clear that does not count. */
export function NetDanRetry() {
  const t = useTranslations("net.dan.joke");
  const [phase, setPhase] = useState<Phase>("failed");
  const [retries, setRetries] = useState(0);
  const [life, setLife] = useState(0);
  const [track, setTrack] = useState(2);
  const [run, setRun] = useState<Run | null>(null);
  const usedExcuses = useRef<number[]>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const finish = (next: Run, attempt: number) => {
    setLife(next.finalLife);
    setTrack(next.finalTrack);
    if (attempt >= CLEAR_ON) {
      setPhase("cleared");
      findNetEgg("danRetry");
    } else {
      setPhase("failed");
    }
  };

  const retry = () => {
    const attempt = retries + 1;
    const clears = attempt >= CLEAR_ON;
    let excuse: number | null = null;
    if (!clears) {
      const options = Array.from({ length: EXCUSES }, (_, index) => index).filter(index => !usedExcuses.current.includes(index));
      excuse = options[Math.floor(Math.random() * options.length)];
      usedExcuses.current.push(excuse);
    }
    const next: Run = {
      finalTrack: clears ? TRACKS : 2 + Math.floor(Math.random() * (TRACKS - 1)),
      finalLife: clears ? 3 + Math.floor(Math.random() * 25) : 0,
      excuse,
    };
    setRetries(attempt);
    setRun(next);
    setPhase("playing");
    setLife(MAX_LIFE);
    setTrack(1);
    if (prefersReducedMotion()) {
      finish(next, attempt);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / RUN_MS);
      const eased = progress * progress;
      setLife(Math.round(MAX_LIFE - (MAX_LIFE - next.finalLife) * eased));
      setTrack(Math.min(next.finalTrack, 1 + Math.floor(progress * next.finalTrack)));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
        finish(next, attempt);
      }
    };
    frame.current = requestAnimationFrame(tick);
  };

  const detail = phase === "playing"
    ? `${t("playing", { track })}  ${t("life", { life })}`
    : phase === "cleared"
      ? t("win", { life })
      : run?.excuse != null ? t(`excuses.${run.excuse}`, { track }) : t("detail");

  return (
    <NetPanel className={cn(styles.joke, phase === "cleared" && styles.jokeCleared)}>
      <div className={styles.jokeHead}>
        <span>{t("name")}</span>
        {phase !== "playing" && (
          <span className={cn(styles.failed, phase === "cleared" && styles.clearedTag)}>
            {phase === "cleared" ? t("cleared") : t("result")}
          </span>
        )}
      </div>
      <div
        className={styles.life}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={MAX_LIFE}
        aria-valuenow={life}
        aria-label={t("life", { life })}
      >
        {life > 0 && <div className={styles.lifeFill} style={{ width: `${(life / MAX_LIFE) * 100}%` }} />}
      </div>
      <div className={styles.jokeDetail} aria-live="polite">{detail}</div>
      {phase === "cleared" && <div className={styles.reward}>{t("code")}</div>}
      <div className={styles.retryRow}>
        {retries > 0 && <span className={styles.credits}>{t("credits", { count: retries, yen: retries * 100 })}</span>}
        {phase === "failed" && <NetButton tone="orange" onClick={retry}>{t("retry")}</NetButton>}
      </div>
    </NetPanel>
  );
}
