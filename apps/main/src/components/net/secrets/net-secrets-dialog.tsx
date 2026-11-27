"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NET_EGGS, onNetSecretsOpen, useNetEggs } from "../eggs/eggs";
import { NetStarArt } from "../net-art";
import { NetSecrets } from "./net-secrets";
import styles from "./secrets.module.css";

/** The always-visible SECRETS button and the sheet it opens. The toast's SEE ALL opens the same sheet. */
export function NetSecretsDialog() {
  const t = useTranslations("net.eggs");
  const found = useNetEggs();
  const [open, setOpen] = useState(false);

  useEffect(() => onNetSecretsOpen(() => setOpen(true)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" className={styles.launcher} onClick={() => setOpen(true)}>
        <NetStarArt size={20} />
        <span>{t("dialog.open")}</span>
        <b>{found.length}/{NET_EGGS.length}</b>
      </button>
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("dialog.label")} onClick={event => event.stopPropagation()}>
            <div className={styles.sheetBar}>
              <b>{t("page.title")}</b>
              <button type="button" onClick={() => setOpen(false)}>{t("dialog.close")}</button>
            </div>
            <div className={styles.sheetBody}>
              <NetSecrets />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
