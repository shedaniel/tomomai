"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@tomomai/ui";
import type { HintPayload } from "@/lib/client-types";
import { IMAGE_KINDS } from "@/lib/hints-meta";
import { buildImageUrl } from "@/lib/api-url";
import { AudioHintCard } from "./AudioHintCard";

type Props = {
  step: number;
  hint: HintPayload;
  dateKey: string;
  /** Past-date slug to append as `&date=…` so the image route resolves the
   *  same chart we're showing. Empty on `/` (today). */
  dateSlug?: string;
  /** Whether this card is the currently-focused one. Audio cards use this
   *  to pause playback when they slide out of focus. */
  isActive?: boolean;
};

/** A single hint, rendered as one card in the deck. */
export function HintCard({ step, hint, dateKey, dateSlug, isActive }: Props) {
  const t = useTranslations("guess.hints");

  if (hint.kind === "audio") {
    return (
      <AudioHintCard
        previewUrl={hint.previewUrl}
        durationSec={hint.durationSec}
        level={hint.level}
        isActive={isActive ?? true}
      />
    );
  }

  if (IMAGE_KINDS.has(hint.kind)) {
    return (
      <Card className="overflow-hidden p-0 border-2 border-border shadow-lg">
        <div className="relative aspect-square w-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildImageUrl(step, dateKey, dateSlug)}
            alt={t(`${hint.kind}.alt`)}
            className="w-full h-full object-cover"
            draggable={false}
            // Force a synchronous decode + eager fetch so the bytes paint
            // on the same frame as the surrounding card, instead of being
            // deferred while the parent's transform/opacity animation runs.
            decoding="sync"
            loading="eager"
            fetchPriority="high"
          />
          {/* No `backdrop-blur-*` here — `backdrop-filter` doesn't compose
              with the parent motion.div's `filter` (drop-shadow class + the
              animated blur), which made the label render as transparent
              until the parent's filter animation finished. */}
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-2xs px-2 py-1 rounded-full">
            {t(`${hint.kind}.label`, { level: hint.level + 1 })}
          </div>
        </div>
      </Card>
    );
  }

  // Text hints: square card so the deck has a uniform footprint.
  return (
    <Card className="p-0 border-2 border-border shadow-lg">
      <CardContent className="aspect-square flex flex-col items-center justify-center text-center gap-3 px-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t(`${hint.kind}.label`)}
        </div>
        <div className="text-2xl font-semibold tabular-nums leading-tight break-words">
          {renderTextHint(hint, t)}
        </div>
      </CardContent>
    </Card>
  );
}

function renderTextHint(
  hint: HintPayload,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  switch (hint.kind) {
    case "length":
      // L1 prefers the placeholder-revealed string: "・・X・・・".
      if (hint.obfuscated) return hint.obfuscated;
      if (hint.exact != null) return t("length.exact", { n: hint.exact });
      return t("length.range", { min: hint.min!, max: hint.max! });
    case "difficulty": {
      const diff = t(`difficulty.values.${hint.difficulty}`);
      if (hint.levelPrecise != null)
        return `${diff} ${hint.levelPrecise.toFixed(1)}`;
      if (hint.displayLevel) return `${diff} ${hint.displayLevel}`;
      return diff;
    }
    case "bpm":
      if (hint.exact != null) return `${hint.exact} BPM`;
      return `${hint.range![0]} – ${hint.range![1]} BPM`;
    case "genre":
      return hint.genre;
    case "game-version":
      return hint.versionName;
    case "artist":
      if (hint.artist) return hint.artist;
      return hint.obfuscated ?? "";
    case "note-designer":
      return hint.designer;
    default:
      return "";
  }
}
