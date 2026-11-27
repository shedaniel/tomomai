"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NetStarArt } from "../net-art";
import { NET_EGGS, NET_HIDDEN_EGGS, onNetEggFound, openNetSecrets, useNetEggs, type NetEggId } from "./eggs";
import styles from "./eggs.module.css";

/** The "SECRET FOUND" banner that drops in whenever any secret is found. */
export function NetEggToast() {
  const t = useTranslations("net.eggs");
  const found = useNetEggs();
  const [current, setCurrent] = useState<NetEggId | null>(null);

  useEffect(() => onNetEggFound(id => setCurrent(id)), []);
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), 6000);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const hiddenKind = (NET_HIDDEN_EGGS as readonly string[]).includes(current);
  return (
    <div className={styles.toast} role="status" onClick={() => setCurrent(null)}>
      <NetStarArt size={34} />
      <div>
        <div className={styles.toastHead}>{t("toast.title")}</div>
        <div className={styles.toastName}>{t(`${hiddenKind ? "hidden" : "list"}.${current}.name`)}</div>
        <div className={styles.toastCount}>{hiddenKind ? t("toast.offList") : t("toast.count", { found: found.length, total: NET_EGGS.length })}</div>
      </div>
      <button type="button" className={styles.toastAll} onClick={event => { event.stopPropagation(); setCurrent(null); openNetSecrets(); }}>
        {t("toast.seeAll")}
      </button>
    </div>
  );
}
