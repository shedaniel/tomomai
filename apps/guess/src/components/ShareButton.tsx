"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tomomai/ui";
import { Check, Share2 } from "lucide-react";
import type { StepResult } from "@/lib/progress";

type Props = {
  dateKey: string;
  results: readonly StepResult[];
  /** Pad the emoji grid up to this many slots with `UNUSED_EMOJI`. */
  totalHints: number;
};

const EMOJI: Record<StepResult, string> = {
  correct: "🟩",
  incorrect: "🟥",
  skipped: "⬜",
};
const UNUSED_EMOJI = "⬛";

function dateSlug(dateKey: string): string {
  // "2026-05-21" → "20260521". Debug keys come through unchanged save for a
  // dash removal (e.g. "debug-19" → "debug19").
  return dateKey.replace(/-/g, "");
}

/** Build the multi-line share string. Window-only (uses location.origin). */
function buildShareText(
  dateKey: string,
  results: readonly StepResult[],
  totalHints: number,
): string {
  const slug = dateSlug(dateKey);
  const cells = results.map((r) => EMOJI[r]);
  while (cells.length < totalHints) cells.push(UNUSED_EMOJI);
  const grid = "💿" + cells.join("");
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://guesser.tomomai.lol";
  const url = `${origin}/${slug}`;
  return [
    `tomomai Guess The Song #${slug}`,
    grid,
    "#tomomai #tomomaiguesser #maimai",
    url,
  ].join("\n");
}

export function ShareButton({ dateKey, results, totalHints }: Props) {
  const t = useTranslations("guess.share");
  const [copied, setCopied] = useState(false);

  const onShare = useCallback(async () => {
    const text = buildShareText(dateKey, results, totalHints);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused — fall back to a manual prompt so the player can
      // copy by hand.
      window.prompt(t("manualPromptTitle"), text);
    }
  }, [dateKey, results, totalHints, t]);

  return (
    <Button onClick={onShare} className="w-full">
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          {t("copied")}
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          {t("button")}
        </>
      )}
    </Button>
  );
}
