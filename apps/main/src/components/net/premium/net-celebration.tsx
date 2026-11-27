"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { NetButton } from "../kit";
import { onNetCelebrate, type NetPaidTier } from "./tier";
import styles from "./premium.module.css";

const COLORS = ["#ff6f62", "#ffb23a", "#ffe23a", "#9be03a", "#3fbcff", "#b56cf7", "#ff4fa8", "#ffffff"];
const SHAPES = ["star", "heart", "sparkle"] as const;

type Piece = { style: CSSProperties; shape?: (typeof SHAPES)[number] };
type Burst = { x: string; y: string; delay: string; color: string };

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, () => {
    const shape = Math.random() < 0.25 ? pick(SHAPES) : undefined;
    const size = shape ? 12 + Math.random() * 12 : 6 + Math.random() * 8;
    return {
      shape,
      style: {
        "--x": `${Math.random() * 100}%`,
        "--w": `${size}px`,
        "--h": `${size * (0.4 + Math.random())}px`,
        "--r": Math.random() < 0.3 ? "50%" : "2px",
        "--c": pick(COLORS),
        "--d": `${2.6 + Math.random() * 3}s`,
        "--delay": `${Math.random() * 2.5}s`,
        "--spin": `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720)}deg`,
      } as CSSProperties,
    };
  });
}

function makeBursts(count: number): Burst[] {
  return Array.from({ length: count }, (_, index) => ({
    x: `${10 + Math.random() * 80}%`,
    y: `${10 + Math.random() * 45}%`,
    delay: `${index * 0.35}s`,
    color: pick(COLORS.slice(0, 7)),
  }));
}

/**
 * Listens for a fake purchase anywhere on /net and covers the whole screen in confetti and fireworks.
 * Mounted once by the shell.
 */
export function NetCelebration() {
  const t = useTranslations("net.premium.thanks");
  const [show, setShow] = useState<{ tier: NetPaidTier; pieces: Piece[]; bursts: Burst[] } | null>(null);

  useEffect(() => onNetCelebrate(tier => setShow({ tier, pieces: makePieces(160), bursts: makeBursts(7) })), []);

  useEffect(() => {
    if (!show) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setShow(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [show]);

  if (!show) return null;
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("title")} onClick={() => setShow(null)}>
      {show.bursts.map((burst, index) => (
        <div key={`b${index}`} className={styles.burst} style={{ "--x": burst.x, "--y": burst.y } as CSSProperties}>
          {Array.from({ length: 14 }, (_, spark) => (
            <span
              key={spark}
              className={styles.spark}
              style={{ "--a": `${(spark / 14) * 360}deg`, "--dist": "90px", "--c": burst.color, "--delay": burst.delay } as CSSProperties}
            />
          ))}
        </div>
      ))}
      {show.pieces.map((piece, index) => (
        <span key={index} className={piece.shape ? `${styles.piece} ${styles[piece.shape]}` : styles.piece} style={piece.style} />
      ))}
      <div className={styles.thanks} onClick={event => event.stopPropagation()}>
        <div className={styles.thanksTop}>
          <div className={styles.thanksTitle}>{t("title")}</div>
          <div className={styles.thanksKana}>{t("kana")}</div>
        </div>
        <div className={styles.medal}>{t(`medal.${show.tier}`)}</div>
        <p className={styles.thanksBody}>{t.rich(`body.${show.tier}`, { strong: chunks => <strong>{chunks}</strong> })}</p>
        <p className={styles.thanksFine}>{t("fine")}</p>
        <NetButton tone="orange" onClick={() => setShow(null)}>{t("close")}</NetButton>
      </div>
    </div>
  );
}
