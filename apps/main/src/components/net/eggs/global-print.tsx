"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { findNetEgg } from "./eggs";
import styles from "./print.module.css";

function playerName(pathname: string) {
  const parts = pathname.split("/");
  const at = parts.indexOf("net");
  const raw = at >= 0 ? parts[at + 1] : undefined;
  if (!raw) return "player";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Printing the page gives you a ¥100 arcade receipt instead of the page. */
export function NetEggPrint() {
  const t = useTranslations("net.common.eggs.print");
  const name = playerName(usePathname());

  useEffect(() => {
    const onPrint = () => findNetEgg("printReceipt");
    window.addEventListener("beforeprint", onPrint);
    return () => window.removeEventListener("beforeprint", onPrint);
  }, []);

  return (
    <div className={styles.receipt} aria-hidden>
      <div className={styles.title}>{t("title")}</div>
      <div className={styles.sub}>{t("subtitle")}</div>
      <div className={styles.rule} />
      <div className={styles.row}><span>{t("line1")}</span><span>{t("price")}</span></div>
      <div className={styles.row}><b>{t("total")}</b><b>{t("price")}</b></div>
      <div className={styles.rule} />
      <div className={styles.credit}>{t("credit")}</div>
      <p className={styles.thanks}>{t("thanks", { name })}</p>
      <p className={styles.keep}>{t("keep")}</p>
      <div className={styles.error}>{t("error")}</div>
    </div>
  );
}
