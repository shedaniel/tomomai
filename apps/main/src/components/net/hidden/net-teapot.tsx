"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { findNetEgg, listenForSequence } from "../eggs/eggs";
import { useNetBase } from "../eggs/use-net-base";
import { NetButton } from "../kit";
import styles from "./hidden.module.css";

const INK = "#1d2b6b";
const JAM_TAPS = 3;
const COINS_NEEDED = 3;
const LIT_MS = 160;
const BUTTON_COUNT = 8;
const SWEEP_KEYS = Array.from({ length: BUTTON_COUNT }, (_, i) => String(i + 1));

/** A maimai cabinet that turned out to be a teapot: the round screen is its belly, ringed by the eight buttons. */
export function NetTeapotMachine({ screen }: { screen: string }) {
  const t = useTranslations("net.home.hidden.teapot");
  const staffPath = `${useNetBase()}/staff`;
  const [jammed, setJammed] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const button3Taps = useRef(0);
  const sweep = useRef(0);
  const litTimer = useRef<number | undefined>(undefined);

  useEffect(() => listenForSequence(SWEEP_KEYS, () => findNetEgg("buttonSpin")), []);
  useEffect(() => () => window.clearTimeout(litTimer.current), []);

  const press = (index: number) => {
    setLit(index);
    window.clearTimeout(litTimer.current);
    litTimer.current = window.setTimeout(() => setLit(null), LIT_MS);

    sweep.current = index === sweep.current ? index + 1 : index === 0 ? 1 : 0;
    if (sweep.current === BUTTON_COUNT) {
      sweep.current = 0;
      findNetEgg("buttonSpin");
    }

    if (index === 2 && ++button3Taps.current >= JAM_TAPS) {
      setJammed(true);
      findNetEgg("stickyButton3");
    }
  };

  const feed = () => {
    const next = tries + 1;
    setTries(next);
    if (next >= COINS_NEEDED) findNetEgg("teapot");
  };

  const buttons = Array.from({ length: BUTTON_COUNT }, (_, i) => -Math.PI / 2 + ((i + 0.5) * Math.PI) / 4);
  return (
    <>
      <div className={styles.art}>
        <svg className={styles.teapotSvg} viewBox="0 0 220 190" role="group" aria-label={t("title")}>
          <g aria-hidden>
            <path className={styles.steam} d="M98 30q-6-8 0-16t0-14" fill="none" stroke="#9aa1aa" strokeWidth={3} strokeLinecap="round" />
            <path className={styles.steam} d="M110 30q-6-8 0-16t0-14" fill="none" stroke="#9aa1aa" strokeWidth={3} strokeLinecap="round" />
            <path className={styles.steam} d="M122 30q-6-8 0-16t0-14" fill="none" stroke="#9aa1aa" strokeWidth={3} strokeLinecap="round" />
            <ellipse cx="110" cy="182" rx="62" ry="5" fill="#00000022" />
            <path d="M44 92L14 70q-8-4-6 4l26 40" fill="#f4f6fa" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
            <path d="M176 82q34-4 32 30t-34 30" fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" />
            <path d="M176 82q34-4 32 30t-34 30" fill="none" stroke="#f4f6fa" strokeWidth={8} strokeLinecap="round" />
            <path d="M78 48h64l6 12H72z" fill="#ff4fa8" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
            <circle cx="110" cy="40" r="8" fill="#ffd23a" stroke={INK} strokeWidth={3} />
            <circle cx="110" cy="116" r="66" fill="#f4f6fa" stroke={INK} strokeWidth={3} />
            <circle cx="110" cy="116" r="44" fill="#141a3a" stroke={INK} strokeWidth={3} />
            <text
              x="110"
              y={jammed ? 124 : 126}
              textAnchor="middle"
              fontSize={jammed ? 22 : 28}
              fontWeight="700"
              fill="#ff4f6e"
              fontFamily="var(--net-font-pop), sans-serif"
            >
              {jammed ? t("jamScreen") : screen}
            </text>
            <rect x="92" y="172" width="36" height="6" rx="2" fill="#4b3a2f" />
          </g>
          {buttons.map((angle, index) => (
            <g
              key={index}
              className={styles.teapotButton}
              role="button"
              tabIndex={0}
              aria-label={t("buttonLabel", { n: index + 1 })}
              onClick={() => press(index)}
              onKeyDown={event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                press(index);
              }}
            >
              <circle cx={110 + Math.cos(angle) * 55} cy={116 + Math.sin(angle) * 55} r={15} fill="transparent" />
              <circle
                cx={110 + Math.cos(angle) * 55}
                cy={116 + Math.sin(angle) * 55}
                r={7}
                fill={lit === index ? "#fff" : index === 2 ? "#ffd23a" : "#3fbcff"}
                stroke={INK}
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
      </div>
      {jammed && (
        <p className={styles.serviceNote} role="status">
          {t.rich("jamNote", { staff: chunks => <Link href={staffPath}>{chunks}</Link> })}
        </p>
      )}
      <p className={styles.body}>{t("body")}</p>
      <p className={styles.aside}>{t("aside")}</p>
      <div className={styles.actions}><NetButton tone="orange" onClick={feed}>{t("insert")}</NetButton></div>
      {tries > 0 && <p className={cn(styles.result)} role="status">{t(tries === 1 ? "inserted" : "insertedAgain")}</p>}
    </>
  );
}
