"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { netPageFromPathname } from "@/lib/net/routes";
import { findNetEgg } from "./eggs/eggs";
import eggStyles from "./eggs/global.module.css";
import styles from "./shell.module.css";

const FIX_CLICKS = 5;

/** Shown on the home page only, where DX NET itself once leaked its PHP errors. */
export function NetPhpWarning({ base }: { base: string }) {
  const t = useTranslations("net.common");
  const pathname = usePathname();
  const clicks = useRef(0);
  const [stage, setStage] = useState<"warning" | "fixed" | "fatal">("warning");

  useEffect(() => {
    if (stage !== "fixed") return;
    const timer = window.setTimeout(() => {
      setStage("fatal");
      findNetEgg("phpWarning");
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [stage]);

  if (netPageFromPathname(pathname, base) !== "home") return null;
  const b = (chunks: ReactNode) => <b>{chunks}</b>;

  if (stage === "fatal") {
    return (
      <div className={styles.php} role="alert">
        {(["fatal", "extra1", "extra2", "extra3"] as const).map(key => (
          <div key={key} className={eggStyles.phpFatal}>{t.rich(`eggs.phpWarning.${key}`, { b })}</div>
        ))}
        <small>{t("eggs.phpWarning.note")}</small>
      </div>
    );
  }
  if (stage === "fixed") {
    return <div className={styles.php} role="status"><span className={eggStyles.phpFixed}>{t("eggs.phpWarning.fixed")}</span></div>;
  }
  return (
    <div className={styles.php}>
      <button
        type="button"
        className={eggStyles.phpButton}
        onClick={() => {
          clicks.current++;
          if (clicks.current >= FIX_CLICKS) setStage("fixed");
        }}
      >
        <br />
        {t.rich("php.warning", { b })}
        <br />
        <small>{t("php.note")}</small>
      </button>
    </div>
  );
}
