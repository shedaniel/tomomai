"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTIES, NET_DIFFICULTY_COLORS, type NetDifficulty } from "./difficulty";
import styles from "./kit.module.css";

/** The six colored difficulty pills, with a yellow marker over the selected one. `"all"` selects none. */
export function NetDifficultyPills({
  value,
  onChange,
  difficulties = NET_DIFFICULTIES,
}: {
  value: NetDifficulty | "all";
  onChange?: (difficulty: NetDifficulty) => void;
  difficulties?: readonly NetDifficulty[];
}) {
  const t = useTranslations("net.common.difficulties");
  return (
    <div className={styles.pills} role="tablist">
      {difficulties.map(difficulty => {
        const active = difficulty === value;
        const remaster = difficulty === "remaster";
        return (
          <button
            key={difficulty}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(difficulty)}
            className={cn(styles.pill, active && styles.pillActive)}
            style={{
              background: NET_DIFFICULTY_COLORS[difficulty].pill,
              ...(remaster && !active ? { color: NET_DIFFICULTY_COLORS.remaster.ink, WebkitTextStroke: 0 } : {}),
            }}
          >
            {t(difficulty)}
          </button>
        );
      })}
    </div>
  );
}
