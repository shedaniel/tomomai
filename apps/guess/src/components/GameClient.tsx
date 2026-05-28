"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tomomai/ui";
import type {
  HintPayload,
  RevealPayload,
  StepResponse,
} from "@/lib/client-types";
import { IMAGE_KINDS } from "@/lib/hints-meta";
import {
  blankProgress,
  loadProgress,
  saveProgress,
  type Persisted,
} from "@/lib/progress";
import { buildChartUrl, buildImageUrl, buildSubmitUrl } from "@/lib/api-url";
import { HintStack } from "./HintStack";
import { SongInput } from "./SongInput";
import { ProgressBar } from "./ProgressBar";
import { ShareButton } from "./ShareButton";

type Revealed = { step: number; hint: HintPayload };

/**
 * Resolve once the browser has the decoded bitmap for `src` in its cache.
 * Using `img.decode()` (not just `onload`) so the bitmap is ready to paint —
 * `onload` fires when bytes arrive, but the first paint of an `<img>` can
 * still trigger a synchronous decode that flashes blank for a frame.
 */
function preloadImage(src: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const img = new window.Image();
    img.src = src;
    if (typeof img.decode === "function") {
      img.decode().then(() => resolve()).catch(() => resolve());
    } else {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    }
  });
}

/** Fetch the reveal step and preload its cover. Returns null on failure. */
async function fetchReveal(
  totalSteps: number,
  dateSlug?: string,
): Promise<RevealPayload | null> {
  const res = await fetch(buildChartUrl(totalSteps - 1, dateSlug));
  if (!res.ok) return null;
  const data = (await res.json()) as StepResponse;
  if (!("reveal" in data)) return null;
  if (data.reveal.cover) await preloadImage(data.reveal.cover);
  return data.reveal;
}

type Props = {
  dateKey: string;
  totalSteps: number;
  /**
   * Slug for past-date routes (`/[date]`). When set, every API fetch
   * appends `?date=<slug>` so the server resolves the same past chart we're
   * displaying. Omit on `/` to default to today.
   */
  dateSlug?: string;
};

export function GameClient({ dateKey, totalSteps, dateSlug }: Props) {
  const t = useTranslations("guess");
  const [progress, setProgress] = useState<Persisted>(() => blankProgress(dateKey));
  const [hints, setHints] = useState<Revealed[]>([]);
  // Ref mirror so the fetch effect can read the latest committed hints
  // without listing `hints` in its deps (which would re-trigger fetches
  // every time setHints fires).
  const hintsRef = useRef<Revealed[]>(hints);
  hintsRef.current = hints;
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);

  // Rehydrate from localStorage after mount (avoid hydration mismatch).
  useEffect(() => {
    setProgress(loadProgress(dateKey));
  }, [dateKey]);

  // Whenever progress.step advances, fetch the new hint(s). Crucially we
  // *only fetch missing steps* and *merge* into the existing hints array
  // (using functional setHints) — never replace. The old approach replaced
  // hints with a single-element array on the first loop iteration, which
  // unmounted every existing card; their Framer Motion state was lost so
  // they "teleported to center" on remount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const target = progress.step;
      const have = new Set(hintsRef.current.map((h) => h.step));

      for (let s = 0; s < target && s < totalSteps - 1; s++) {
        if (have.has(s)) continue;
        const res = await fetch(buildChartUrl(s, dateSlug));
        if (!res.ok) continue;
        const data = (await res.json()) as StepResponse;
        if (!("hint" in data)) continue;

        if (IMAGE_KINDS.has(data.hint.kind)) {
          await preloadImage(buildImageUrl(s, dateKey, dateSlug));
        }
        if (cancelled) return;
        have.add(s);
        // Functional update: merge into whatever the current state is, then
        // sort by step so the deck order matches step order regardless of
        // arrival order.
        setHints((prev) => {
          if (prev.some((p) => p.step === s)) return prev;
          return [...prev, { step: data.step, hint: data.hint }].sort(
            (a, b) => a.step - b.step,
          );
        });
      }

      // Fetch the reveal on rehydrate whenever the game is over — whether
      // the player won or gave up. Previously only the `won` case triggered
      // this, so a refresh after a loss showed the input as still playable.
      const gaveUp =
        !progress.won && progress.results.length >= totalSteps - 1;
      if (!cancelled && (progress.won || gaveUp) && !reveal) {
        const r = await fetchReveal(totalSteps, dateSlug);
        if (!cancelled && r) setReveal(r);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progress.step, progress.won, progress.results.length, totalSteps, reveal, dateKey, dateSlug]);

  const submit = useCallback(async () => {
    if (!guess.trim() || busy || progress.won) return;
    setBusy(true);
    try {
      const res = await fetch(buildSubmitUrl(dateSlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      const data = (await res.json()) as
        | { correct: true; reveal: RevealPayload }
        | { correct: false };
      if (data.correct) {
        if (data.reveal.cover) await preloadImage(data.reveal.cover);
        setReveal(data.reveal);
        setProgress((p) => {
          const next: Persisted = {
            ...p,
            won: true,
            results: [...p.results, "correct"],
          };
          saveProgress(next);
          return next;
        });
        setGuess("");
      } else {
        // Wrong → silently advance to the next hint. Record incorrect.
        setProgress((p) => {
          const next: Persisted = {
            ...p,
            step: Math.min(p.step + 1, totalSteps - 1),
            results: [...p.results, "incorrect"],
          };
          saveProgress(next);
          return next;
        });
        setGuess("");
      }
    } finally {
      setBusy(false);
    }
  }, [guess, busy, progress.won, totalSteps, dateSlug]);

  const skip = useCallback(() => {
    if (progress.won) return;
    if (progress.step >= totalSteps - 1) {
      // Out of hints — show the reveal. Record "skipped" for the final hint.
      (async () => {
        const r = await fetchReveal(totalSteps, dateSlug);
        if (!r) return;
        setReveal(r);
        setProgress((p) => {
          const next: Persisted = {
            ...p,
            won: false,
            step: totalSteps - 1,
            results: [...p.results, "skipped"],
          };
          saveProgress(next);
          return next;
        });
      })();
      return;
    }
    setProgress((p) => {
      const next: Persisted = {
        ...p,
        step: Math.min(p.step + 1, totalSteps - 1),
        results: [...p.results, "skipped"],
      };
      saveProgress(next);
      return next;
    });
  }, [progress.won, progress.step, totalSteps, dateSlug]);

  // Game over when the player has either won or used all their hints. Don't
  // gate on `reveal` here — on refresh after a loss the reveal cover may not
  // be loaded yet, but the game IS over, so the input must stay disabled.
  const finished =
    progress.won || progress.results.length >= totalSteps - 1;
  const hintsLeft = totalSteps - 1 - progress.step;

  // Are we still waiting for the network / image decode? Two sources:
  // - hints not yet caught up to progress.step (server fetch in flight)
  // - won/given-up but reveal cover not yet preloaded
  const expectedHintCount = Math.min(progress.step, totalSteps - 1);
  const hintsLoading = hints.length < expectedHintCount;
  const revealLoading =
    (progress.won || (!progress.won && progress.step >= totalSteps)) &&
    !reveal;
  const loading = hintsLoading || revealLoading;
  const buttonsDisabled = busy || loading;

  // Total actionable hints = total steps minus the reveal step.
  const totalHints = totalSteps - 1;

  return (
    <div className="space-y-6">
      <HintStack hints={hints} dateKey={dateKey} dateSlug={dateSlug} reveal={reveal} />

      <ProgressBar results={progress.results} total={totalHints} />

      <div className="space-y-3">
        <div className="flex items-stretch gap-2">
          <div className="flex-1">
            <SongInput
              value={guess}
              onChange={setGuess}
              onSubmit={submit}
              disabled={finished || buttonsDisabled}
            />
          </div>
          {guess.trim() ? (
            <Button
              onClick={submit}
              disabled={finished || buttonsDisabled}
              className="shrink-0"
            >
              {t("buttons.submit")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={skip}
              disabled={finished || buttonsDisabled}
              className="shrink-0"
            >
              {hintsLeft > 0 ? t("buttons.nextHint") : t("buttons.giveUp")}
            </Button>
          )}
        </div>

        {finished && (
          <>
            <div className="text-center text-sm text-muted-foreground">
              {t("comeBack")}
            </div>
            <ShareButton
              dateKey={dateKey}
              results={progress.results}
              totalHints={totalHints}
            />
          </>
        )}
      </div>
    </div>
  );
}
