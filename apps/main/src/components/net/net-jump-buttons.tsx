"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { findNetEgg } from "./eggs/eggs";
import eggStyles from "./eggs/global.module.css";
import styles from "./shell.module.css";

type Side = "top" | "bottom";

export function NetJumpButtons() {
  const t = useTranslations("net.common");
  const [bubble, setBubble] = useState<{ side: Side; line: string; key: number } | null>(null);
  const presses = useRef<Record<Side, number>>({ top: 0, bottom: 0 });

  useEffect(() => {
    if (!bubble) return;
    const timer = window.setTimeout(() => setBubble(null), 3200);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  const nowhere = (side: Side) => {
    const lines = t.raw(`eggs.jump.${side}`) as string[];
    const line = lines[presses.current[side]++ % lines.length];
    setBubble({ side, line, key: Date.now() });
    findNetEgg("topAtTop");
  };

  const up = () => {
    if (window.scrollY <= 2) return nowhere("top");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const down = () => {
    const root = document.documentElement;
    if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) return nowhere("bottom");
    window.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className={styles.jump}>
      {bubble && (
        <div key={bubble.key} role="status" className={cn(eggStyles.jumpBubble, bubble.side === "top" ? eggStyles.jumpBubbleTop : eggStyles.jumpBubbleBottom)}>
          {bubble.line}
        </div>
      )}
      <button type="button" className={styles.jumpUp} onClick={up}>{t("top")}</button>
      <button type="button" className={styles.jumpDown} onClick={down}>{t("bottom")}</button>
    </div>
  );
}
