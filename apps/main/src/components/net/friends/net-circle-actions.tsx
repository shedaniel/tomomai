"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "../eggs/eggs";
import { NetCopyButton } from "./net-friend-code";
import styles from "./friends.module.css";

export function NetCircleButtons({ code }: { code: string }) {
  const t = useTranslations("net.friends.circle");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className={styles.circleButtons}>
        <NetCopyButton text={code} className={styles.circleButton}>{t("copyCode")}</NetCopyButton>
        <button type="button" className={styles.circleButton} onClick={() => setSaved(true)}>{t("save")}</button>
      </div>
      {saved && <p className={styles.centered} role="status">{t("saved")}</p>}
    </>
  );
}

const LEAVE_PRESSES = 5;

export function NetLeaveCircleButton() {
  const t = useTranslations("net.friends.circle");
  const [presses, setPresses] = useState(0);
  const crowned = presses >= LEAVE_PRESSES;
  return (
    <>
      <button
        type="button"
        className={styles.leave}
        onClick={() => {
          const next = presses + 1;
          setPresses(next);
          if (next === LEAVE_PRESSES) findNetEgg("circleEscape");
        }}
      >
        {t("leave")}
      </button>
      {presses > 0 && (
        <p className={styles.centered} role="status">
          {crowned ? t("leaveCrowned") : presses === 1 ? t("leaveBlocked") : t("leaveAgain", { count: presses })}
        </p>
      )}
    </>
  );
}
