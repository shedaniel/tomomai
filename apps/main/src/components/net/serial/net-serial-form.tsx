"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg, type NetEggId } from "../eggs/eggs";
import { NetButton } from "../kit";
import { NetLockArt, NetStarArt } from "../net-art";
import { NetAiMascot } from "../friends/net-ai-mascot";
import { NetSpecialAvatar } from "../friends/net-special-avatars";
import styles from "./serial.module.css";

type Reward = "php" | "aprilfools" | "sega" | "utage" | "chunithm" | "hunter2" | "tomomai" | "iddqd";

const CODES: Readonly<Record<string, Reward>> = {
  PHP: "php",
  APRILFOOLS: "aprilfools",
  SEGA: "sega",
  UTAGE: "utage",
  宴: "utage",
  CHUNITHM: "chunithm",
  ONGEKI: "chunithm",
  HUNTER2: "hunter2",
  TOMOMAI: "tomomai",
  IDDQD: "iddqd",
};

const EGG_IDS: Partial<Readonly<Record<Reward, NetEggId>>> = {
  utage: "serialUtage",
  tomomai: "serialTomomai",
};

const INK = "#4b3a2f";

function Elephant() {
  return (
    <svg viewBox="0 0 64 48" width={64} height={48} aria-hidden>
      <ellipse cx="36" cy="26" rx="20" ry="15" fill="#8892bf" stroke={INK} strokeWidth={2.4} />
      <ellipse cx="26" cy="22" rx="8" ry="10" fill="#6f78ad" stroke={INK} strokeWidth={2} />
      <path d="M17 24c-6 3-8 10-4 16" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <path d="M17 24c-6 3-8 10-4 16" fill="none" stroke="#8892bf" strokeWidth={3.6} strokeLinecap="round" />
      <path d="M26 39v6M46 39v6" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M19 19h4" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function Lantern() {
  return (
    <svg viewBox="0 0 48 56" width={48} height={56} aria-hidden>
      <path d="M18 4h12v5H18z" fill={INK} />
      <rect x="6" y="9" width="36" height="38" rx="14" fill="#e04050" stroke={INK} strokeWidth={2.4} />
      <text x="24" y="36" textAnchor="middle" fontSize="20" fill="#fff" stroke={INK} strokeWidth={3} paintOrder="stroke" fontWeight={800}>宴</text>
      <path d="M18 47h12v5H18z" fill={INK} />
    </svg>
  );
}

function WrongCabinet() {
  return (
    <svg viewBox="0 0 56 56" width={56} height={56} aria-hidden>
      <rect x="10" y="4" width="36" height="48" rx="4" fill="#3db0ff" stroke={INK} strokeWidth={2.4} />
      <rect x="15" y="9" width="26" height="18" rx="2" fill="#fff" stroke={INK} strokeWidth={2} />
      <path d="M14 36h28M14 42h28" stroke={INK} strokeWidth={2.4} />
      <path d="M6 6l44 44M50 6L6 50" stroke="#e04050" strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 48 56" width={48} height={56} aria-hidden>
      <path d="M24 3l19 7v16c0 13-9 22-19 27C14 48 5 39 5 26V10z" fill="#ffd23a" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <text x="24" y="35" textAnchor="middle" fontSize="13" fill="#fff" stroke={INK} strokeWidth={3} paintOrder="stroke" style={{ fontFamily: "var(--net-font-pop), sans-serif", fontWeight: 700 }}>GOD</text>
    </svg>
  );
}

const ART: Readonly<Record<Reward, () => ReactNode>> = {
  php: () => <Elephant />,
  aprilfools: () => <NetStarArt size={40} />,
  sega: () => <NetSpecialAvatar kind="sega" size={52} />,
  utage: () => <Lantern />,
  chunithm: () => <WrongCabinet />,
  hunter2: () => <NetLockArt size={44} />,
  tomomai: () => <NetAiMascot size={56} />,
  iddqd: () => <Shield />,
};

const HIDDEN = "*******";

/** Every code is already used, except the secret ones, which hand out a reward nobody can keep. */
export function NetSerialForm({ rating }: { rating: number | null }) {
  const t = useTranslations("net.serial");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);

  const submit = () => {
    const trimmed = code.trim();
    const normalized = trimmed.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (!normalized && !trimmed) {
      setResult(t("empty"));
      return;
    }
    const egg = CODES[normalized] ?? CODES[trimmed];
    if (egg) {
      setResult(null);
      setReward(egg);
      if (egg === "hunter2") setCode(HIDDEN);
      const id = EGG_IDS[egg];
      if (id) findNetEgg(id);
      return;
    }
    setResult(t("used"));
  };

  const body = reward === "iddqd"
    ? rating == null ? t("rewards.iddqdNoRating") : t("rewards.iddqd.body", { rating: String(rating) })
    : reward && t(`rewards.${reward}.body`);

  return (
    <>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); submit(); }}>
        <input
          className={styles.input}
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("label")}
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
        />
        <div className={styles.rules}>
          {t("notice")}<br />{t("rule1")}<br />{t("rule2")}<br />{t("rule3")}
        </div>
        <NetButton type="submit" className={styles.submit}>{t("submit")}</NetButton>
        {result && <div className={styles.result} role="status">{result}</div>}
      </form>
      {reward && (
        <div key={reward} className={styles.toast} data-reward={reward} role="status">
          <h4>{t(`rewards.${reward}.title`)}</h4>
          <div className={styles.toastArt}>{ART[reward]()}</div>
          <p>{body}</p>
          <NetButton tone="orange" onClick={() => setReward(null)}>{t("close")}</NetButton>
        </div>
      )}
    </>
  );
}
