"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_EGGS, openNetSecrets, useNetEggs } from "../eggs/eggs";
import { NetButton } from "../kit";
import { NET_STAMP_THEMES, NetStamp } from "./net-stamp-card";
import styles from "./stamp-card.module.css";

const THEME = NET_STAMP_THEMES.star;

/** Counts the hidden secrets found in this browser. Sealed until the first one. */
export function NetSecretStampCard() {
  const t = useTranslations("net.stampCard.secret");
  const found = useNetEggs();
  const total = NET_EGGS.length;
  const complete = found.length >= total;
  const style = { "--stamp-band": THEME.band, "--stamp-ink": THEME.ink } as CSSProperties;

  return (
    <section className={styles.entry}>
      <h4 className={cn(styles.label, styles.secretLabel)}>{t("label")}</h4>
      {found.length === 0 ? (
        <div className={cn(styles.secretCard, styles.secretSealed)} style={style}>
          <span className={styles.secretSeal} aria-hidden>???</span>
          <p className={styles.secretHint}>{t("sealed")}</p>
        </div>
      ) : (
        <>
          <div className={styles.secretCard} style={style} role="group" aria-label={t("count", { found: found.length, total })}>
            <div className={styles.secretStamps}>
              {NET_EGGS.map((id, index) => <NetStamp key={id} motif="star" filled={index < found.length} />)}
            </div>
            {complete && <span className={styles.complete} aria-hidden>{t("completeStamp")}</span>}
          </div>
          <div className={styles.source}>
            <span>{complete ? t("complete") : t("source")}</span>
            <b>{t("count", { found: found.length, total })}</b>
          </div>
        </>
      )}
      <div className={styles.secretActions}>
        <NetButton onClick={openNetSecrets}>{t("open")}</NetButton>
      </div>
    </section>
  );
}
