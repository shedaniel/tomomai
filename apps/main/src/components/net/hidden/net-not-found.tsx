"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { NetAiMascot } from "../friends/net-ai-mascot";
import { NetButtonLink, NetTitle } from "../kit";
import { findNetEgg } from "../eggs/eggs";
import { Link } from "@/i18n/navigation";
import { useNetBase } from "../eggs/use-net-base";
import styles from "./hidden.module.css";

/** DX NET's error screen for any path under a player that does not exist. */
export function NetNotFound() {
  const t = useTranslations("net.home.hidden.notFound");
  const base = useNetBase();
  useEffect(() => findNetEgg("notFound"), []);

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <section className={styles.error}>
        <div className={styles.code}>{t("code")}</div>
        <p className={styles.body}>{t("body")}</p>
        <div className={styles.art}><NetAiMascot size={88} /></div>
        <p className={styles.aside}>
          {t.rich("aside", { cabinet: chunks => <Link href={`${base}/teapot`} className={styles.asideLink}>{chunks}</Link> })}
        </p>
        <div className={styles.actions}><NetButtonLink href={base} tone="orange">{t("home")}</NetButtonLink></div>
      </section>
    </>
  );
}
