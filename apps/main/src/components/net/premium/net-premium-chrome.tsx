"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useNetDarkMode, useNetTier } from "./tier";
import styles from "./premium.module.css";

/** The course ribbon under the logo, once something has been "bought". */
export function NetTierBadge() {
  const t = useTranslations("net.premium.badge");
  const tier = useNetTier();
  if (tier === "free") return null;
  return <span className={cn(styles.badge, tier === "premium" ? styles.badgePremium : styles.badgeStandard)}>{t(tier)}</span>;
}

/** Premium's one real perk: a dark mode made by inverting everything. */
export function NetDarkModeEffect() {
  const tier = useNetTier();
  const dark = useNetDarkMode();
  const on = tier === "premium" && dark;
  useEffect(() => {
    if (!on) return;
    document.documentElement.dataset.netDark = "";
    return () => { delete document.documentElement.dataset.netDark; };
  }, [on]);
  return null;
}
