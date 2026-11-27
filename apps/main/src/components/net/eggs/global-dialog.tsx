"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./global.module.css";

const AIME_EVENT = "tomomai-net-aime-open";

export function openNetAime() {
  window.dispatchEvent(new Event(AIME_EVENT));
}

export function onNetAimeOpen(listener: () => void) {
  window.addEventListener(AIME_EVENT, listener);
  return () => window.removeEventListener(AIME_EVENT, listener);
}

type Tone = "blue" | "pink" | "yellow";

export function NetEggDialogCard({ title, tone = "blue", actions, children, style }: {
  title: ReactNode;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={styles.dialog} role="dialog" aria-modal="true" style={style}>
      <div className={cn(styles.dialogHead, tone === "pink" && styles.dialogHeadPink, tone === "yellow" && styles.dialogHeadYellow)}>{title}</div>
      <div className={styles.dialogBody}>{children}</div>
      {actions && <div className={styles.dialogActions}>{actions}</div>}
    </div>
  );
}

export function NetEggBackdrop({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) onClick?.(); }}>
      {children}
    </div>
  );
}

export function NetEggBanner({ tag, tone, children, close, onClose }: {
  tag: ReactNode;
  tone?: "red" | "pink";
  children: ReactNode;
  close: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.banner} role="status">
      <span className={cn(styles.bannerTag, tone === "red" && styles.bannerTagRed, tone === "pink" && styles.bannerTagPink)}>{tag}</span>
      <span className={styles.bannerText}>{children}</span>
      <button type="button" className={styles.bannerClose} onClick={onClose}>{close}</button>
    </div>
  );
}
