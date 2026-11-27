"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NetTownArt } from "../net-art";
import { findNetEgg } from "./eggs";
import styles from "./global.module.css";
import trails from "./trails.module.css";
import { useNetBase } from "./use-net-base";

const FERRIS_CLICKS = 5;
const LOTUS_TAPS = 3;

const BLOOM_COLORS = ["#ff8fb0", "#ffffff", "#c58af2", "#ffe066", "#7ac8ff", "#ff9a6b", "#9be03a", "#ff6fae", "#b9a7ff"];

function LotusFlower({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 28 40" width="100%" aria-hidden>
      <path d="M14 40V22" stroke="#2f8f3f" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="14" cy="38" rx="10" ry="2.6" fill="#3fbf4f" stroke="#1d2b6b" strokeWidth="1.2" />
      <g stroke="#1d2b6b" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M14 22C6 21 3 15 3 9c6 1 10 5 11 13z" fill={color} />
        <path d="M14 22c8-1 11-7 11-13-6 1-10 5-11 13z" fill={color} />
        <path d="M14 22C9 18 8 11 14 3c6 8 5 15 0 19z" fill={color} />
      </g>
      <circle cx="14" cy="17" r="1.8" fill="#ffd23a" stroke="#1d2b6b" strokeWidth="1" />
    </svg>
  );
}

/** A whole pond of lotuses in different colors, opening one after another, with petals drifting down. */
function LotusBloom() {
  return (
    <div className={trails.bloom} aria-hidden>
      {BLOOM_COLORS.map((color, index) => (
        <span key={color} className={trails.flower} style={{ left: `${6 + index * 10.5}%`, animationDelay: `${index * 140}ms` }}>
          <LotusFlower color={color} />
        </span>
      ))}
      {Array.from({ length: 14 }, (_, index) => (
        <i
          key={index}
          className={trails.petal}
          style={{ left: `${4 + ((index * 37) % 92)}%`, animationDelay: `${600 + index * 220}ms`, background: BLOOM_COLORS[index % BLOOM_COLORS.length] }}
        />
      ))}
    </div>
  );
}

export function NetEggTown() {
  const t = useTranslations("net.common.eggs.ferris");
  const door = useTranslations("net.common.eggs.door");
  const lotusT = useTranslations("net.common.eggs.lotus");
  const staffPath = `${useNetBase()}/staff`;
  const clicks = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [open, setOpen] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const lotusTaps = useRef(0);
  const [bloomed, setBloomed] = useState(false);

  const tendLotus = () => {
    lotusTaps.current++;
    if (lotusTaps.current < LOTUS_TAPS) return;
    setBloomed(true);
    findNetEgg("hasunosora");
  };

  const ride = () => {
    clicks.current++;
    if (clicks.current < FERRIS_CLICKS) return;
    setSpinning(true);
    setOpen(true);
    findNetEgg("ferris");
  };

  return (
    <>
      {open && <div className={styles.townNote} role="status">{t("note")}</div>}
      {bloomed && <div className={styles.townNote} role="status">{lotusT("note")}</div>}
      {bloomed && <LotusBloom />}
      {doorOpen && (
        <div className={trails.doorNote} role="status">
          {door.rich("note", { staff: chunks => <Link href={staffPath} className={trails.link}>{chunks}</Link> })}
        </div>
      )}
      <NetTownArt
        lotus={{
          role: "button",
          tabIndex: 0,
          "aria-label": lotusT("label"),
          className: trails.door,
          bloomed,
          onClick: tendLotus,
          onKeyDown: event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            tendLotus();
          },
        }}
        door={{
          role: "button",
          tabIndex: 0,
          "aria-label": door("label"),
          className: trails.door,
          onClick: () => setDoorOpen(value => !value),
          onKeyDown: event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setDoorOpen(value => !value);
          },
        }}
        wheel={{
          role: "button",
          tabIndex: 0,
          "aria-label": t("label"),
          className: cn(styles.wheel, spinning && styles.wheelSpin),
          onClick: ride,
          onKeyDown: event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            ride();
          },
          onAnimationEnd: () => setSpinning(false),
        }}
      />
    </>
  );
}

export function NetEggCopyright({ className }: { className: string }) {
  const t = useTranslations("net.common.eggs.copyright");
  const staffPath = `${useNetBase()}/staff`;
  const [open, setOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (!open) return [];
    const holders = t.raw("holders") as string[];
    const suffixes = t.raw("suffixes") as string[];
    return Array.from({ length: holders.length * suffixes.length }, (_, k) => {
      const round = Math.floor(k / holders.length);
      const holder = k % holders.length;
      return `©${holders[holder]} ${suffixes[(holder * 7 + round) % suffixes.length]}`;
    });
  }, [open, t]);

  useEffect(() => {
    const node = end.current;
    if (!open || !node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) findNetEgg("copyright");
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  return (
    <>
      <button type="button" className={cn(className, styles.moreButton)} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {t(open ? "less" : "more")}
      </button>
      {open && (
        <>
          <ul className={styles.fineList}>
            {lines.map(line => <li key={line}>{line}</li>)}
            <li className={trails.fineStaff}>
              {t.rich("staff", { staff: chunks => <Link href={staffPath}>{chunks}</Link> })}
            </li>
          </ul>
          <div ref={end} className={styles.fineEnd}>{t("end")}</div>
        </>
      )}
      <HiringLink />
    </>
  );
}

function HiringLink() {
  const t = useTranslations("net.common.eggs.console");
  const staffPath = `${useNetBase()}/staff`;
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const letter = t("rejection").split("/staff");

  const apply = () => {
    setApplied(true);
    findNetEgg("console");
  };

  return (
    <>
      <button type="button" className={trails.hiring} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {t("hiringLink")}
      </button>
      {open && (
        <div className={trails.drawer} role="dialog" aria-label={t("drawerTitle")}>
          <div className={trails.drawerHead}>
            <span>{t("drawerTitle")}</span>
            <button type="button" className={trails.drawerClose} onClick={() => setOpen(false)}>{t("drawerClose")}</button>
          </div>
          <div className={trails.drawerBody}>
            <p className={cn(trails.drawerLine, trails.drawerBanner)}>{t("banner")} {t("tagline")}</p>
            <p className={cn(trails.drawerLine, trails.drawerHire)}>{t("hiring")}</p>
            <div className={trails.prompt}>
              <span aria-hidden>&gt;</span>
              <button type="button" className={trails.applyButton} onClick={apply}>{t("drawerApply")}</button>
            </div>
            {applied && (
              <>
                <p className={trails.letter} role="status">
                  {letter.map((part, index) => (
                    <span key={index}>
                      {index > 0 && <Link href={staffPath}>/staff</Link>}
                      {part}
                    </span>
                  ))}
                </p>
                <p className={trails.drawerLine}>{t("applied")}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
