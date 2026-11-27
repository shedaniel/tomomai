"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import styles from "./global.module.css";

export type NetJudgementGrade = "criticalPerfect" | "perfect" | "great" | "good" | "miss";

export type NetJudgementProps = {
  grade: NetJudgementGrade;
  /** The note type above the grade, like TOUCH HOLD or SLIDE! */
  label?: string;
  /** Viewport point to center on. Defaults to the middle of the screen. */
  x?: number;
  y?: number;
  big?: boolean;
};

const SHOW_MS = 1500;

/** Where fixed egg overlays mount: inside the NET fonts, outside the column that UTAGE rotates and dark mode filters. */
export function netOverlayRoot() {
  return document.querySelector("[data-net-stage]") ?? document.body;
}

const GRADE_CLASS: Record<NetJudgementGrade, string> = {
  criticalPerfect: styles.gradeCritical,
  perfect: styles.gradePerfect,
  great: styles.gradeGreat,
  good: styles.gradeGood,
  miss: styles.gradeMiss,
};

/** A maimai judgement that pops at a point and floats away. */
export function NetJudgement({ grade, label, x, y, big }: NetJudgementProps) {
  const t = useTranslations("net.common.eggs.judgement");
  const style = x === undefined || y === undefined ? undefined : { left: `clamp(120px, ${x}px, calc(100% - 120px))`, top: y };
  return createPortal(
    <div className={cn(styles.judgement, big && styles.judgementBig, style && styles.judgementAt)} style={style} role="status">
      {label && <div className={styles.judgementLabel}>{label}</div>}
      <div className={cn(styles.judgementGrade, GRADE_CLASS[grade])}>{t(grade)}</div>
    </div>,
    netOverlayRoot(),
  );
}

/** Returns the judgement to render and a function that shows a new one, replacing any still on screen. */
export function useNetJudgement() {
  const [shown, setShown] = useState<(NetJudgementProps & { key: number }) | null>(null);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  const show = useCallback((props: NetJudgementProps) => setShown({ ...props, key: Date.now() }), []);
  let node = null;
  if (shown) {
    const { key, ...props } = shown;
    node = <NetJudgement key={key} {...props} />;
  }
  return [node, show] as const;
}
