"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "./eggs/eggs";
import { NetButton } from "./kit";
import { NET_TIERS, purchaseNetTier, useNetTier, type NetPaidTier } from "./premium/tier";
import styles from "./paywall.module.css";

/**
 * Blurs `children` behind a fake Standard Course offer until a course is "bought". Subscribing stores the
 * course in this browser and throws confetti. Nothing is ever charged. `feature` names what is locked.
 */
export function NetPaywall({ feature, requires = "standard", children }: { feature: ReactNode; requires?: NetPaidTier; children: ReactNode }) {
  const t = useTranslations("net.common.paywall");
  const tier = useNetTier();
  const [unlocked, setUnlocked] = useState(false);
  if (unlocked || NET_TIERS.indexOf(tier) >= NET_TIERS.indexOf(requires)) return <>{children}</>;
  return (
    <div className={styles.wrap}>
      <div className={styles.rail}>
        <div className={styles.card} role="dialog" aria-label={t(`${requires}.title`)}>
          <h4>{t(`${requires}.title`)}</h4>
          <p>{t(`${requires}.body`, { feature: String(feature) })}</p>
          <div className={styles.price}>{t(`${requires}.price`)}<small>{t("perMonth")}</small></div>
          <NetButton tone="orange" onClick={() => purchaseNetTier(requires)}>{t("subscribe")}</NetButton>
          <button type="button" className={styles.free} onClick={() => { findNetEgg("aprilFoolsBypass"); setUnlocked(true); }}>{t("free")}</button>
        </div>
      </div>
      <div className={styles.locked} aria-hidden>{children}</div>
    </div>
  );
}
