"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent } from "@tomomai/ui";
import { triggerHaptic } from "@tomomai/ui/haptics";
import { cn } from "@tomomai/ui/utils";
import { Play, Pause, RotateCcw, Loader2 } from "lucide-react";
import { useVolume, volumeToAmplitude } from "@/lib/use-volume";
import { withAudioFormat } from "@/lib/audio-format";
import { getAudioContext, unlockAudio, loadClip, isClipReady } from "@/lib/audio-engine";
import { VolumeControl } from "./VolumeControl";
import type { AudioModifier } from "@/lib/heardle-config";

type Props = {
  previewUrl: string;
  /** Displayed clip length (what the player reads on the card). */
  durationSec: number;
  /** Actual wall-clock playback length. Defaults to `durationSec`. */
  audibleSec?: number;
  /** v2 audio modifier (plain / speed / pitch). Drives the badge text. */
  modifier?: AudioModifier;
  /** Hint level (0..5) — used for the small label badge. */
  level: number;
  /** Total hint count, so the label reads "1 / 6" etc. */
  totalLevels?: number;
  /** Pause playback when the card stops being the focused one in the deck. */
  isActive: boolean;
};

function modifierLabel(m: AudioModifier | undefined): string | null {
  if (!m || m.kind === "plain") return null;
  if (m.kind === "speed") return `${m.rate}× speed`;
  return `pitch ${m.semitones > 0 ? "+" : "−"}${Math.abs(m.semitones)}`;
}

/** Compact, technical description of a playback failure for the toast. Tagged
 * with the negotiated container so a lingering failure says which path (webm
 * vs mp4) was tried. */
function describeError(thrown: unknown, fmt?: string): string {
  const suffix = fmt ? ` (fmt=${fmt})` : "";
  if (thrown instanceof Error) {
    return (thrown.message ? `${thrown.name}: ${thrown.message}` : thrown.name) + suffix;
  }
  return (thrown ? String(thrown) : "unknown error") + suffix;
}

/**
 * Heardle audio hint card. Plays a clipped window (`durationSec`) of the
 * Apple Music preview starting from t=0. Each hint level reveals a longer
 * window; clips are decoded once and replayed from a buffer (see
 * `lib/audio-engine.ts`) so playback is instant and reliable on iOS.
 */
export function AudioHintCard({
  previewUrl,
  durationSec,
  audibleSec,
  modifier,
  level,
  totalLevels,
  isActive,
}: Props) {
  const modLabel = modifierLabel(modifier);
  const playSec = audibleSec ?? durationSec;
  const t = useTranslations("guess.hints.audio");

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startRef = useRef(0); // AudioContext.currentTime when playback began
  const rafRef = useRef<number | null>(null);
  // Bumped on every stop/new play so an in-flight play() can tell it was
  // cancelled (user pressed again, or the card changed) while it awaited the
  // clip, and bail instead of starting stale audio.
  const playTokenRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of playSec
  const [volume] = useVolume();

  // The v2 route serves Opus/WebM or AAC/MP4; Safari can't decode the former,
  // so we negotiate the container client-side via canPlayType. Resolve the URL
  // only after mount: the empty initial state is identical on server and client
  // (no hydration mismatch) and keeps Safari from fetching an unplayable format.
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc(withAudioFormat(previewUrl));
  }, [previewUrl]);

  // Prewarm: fetch + decode the focused card's clip ahead of the first press so
  // it plays instantly. Decoding works while the context is suspended.
  useEffect(() => {
    if (!isActive || !src) return;
    loadClip(src).catch(() => {
      // Surfaced when the user actually presses play; ignore here.
    });
  }, [isActive, src]);

  const currentFmt = () => /[?&]fmt=([^&]+)/.exec(src)?.[1];

  // Tear down the audio graph without touching React state or the play token.
  const teardownGraph = () => {
    const s = sourceRef.current;
    if (s) {
      s.onended = null; // prevent the natural-end handler from re-firing
      try {
        s.stop();
      } catch {
        // already stopped or ended
      }
      s.disconnect();
      sourceRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // User-facing stop: cancel any in-flight play(), tear down, reset the UI.
  const stop = () => {
    playTokenRef.current++;
    teardownGraph();
    setPlaying(false);
    setLoading(false);
    setProgress(0);
  };

  // Stop whenever the clip or playback length changes (e.g. moving cards).
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playSec]);

  // Pause when this card stops being the active one — swipe, arrow buttons,
  // dot nav, submit, and skip all flip the deck through `isActive`.
  useEffect(() => {
    if (!isActive && playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Live volume changes during playback. Uses a GainNode because iOS ignores
  // HTMLMediaElement.volume entirely.
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volumeToAmplitude(volume);
  }, [volume]);

  const play = async () => {
    if (!src) return;
    const ctx = getAudioContext();
    if (!ctx) {
      toast.error(t("error", { detail: "Web Audio unavailable" }), {
        id: "audio-error",
      });
      return;
    }
    // Synchronously, still inside the click gesture: unlock audio output so iOS
    // doesn't mute the first clip.
    unlockAudio(ctx);
    const token = ++playTokenRef.current;
    // Show the spinner only when the clip isn't decoded yet — prewarmed clips
    // start instantly, so this avoids a flicker on the common path.
    if (!isClipReady(src)) setLoading(true);
    try {
      if (ctx.state !== "running") await ctx.resume();
      const buffer = await loadClip(src);
      // Bail if the user stopped/re-pressed or the card changed while we waited.
      if (token !== playTokenRef.current) return;

      teardownGraph(); // clear any prior graph before starting a new one
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = volumeToAmplitude(volume);
      source.connect(gain).connect(ctx.destination);
      sourceRef.current = source;
      gainRef.current = gain;

      source.onended = () => {
        // Subtle tactile cue that the clip just ended — distinct from the
        // firmer "medium" press felt when triggering play/pause.
        triggerHaptic("soft");
        stop();
      };
      // Clips are already trimmed server-side; cap the duration defensively so
      // the audio and the progress ring always agree on the end.
      source.start(0, 0, playSec);
      startRef.current = ctx.currentTime;
      setLoading(false);
      setPlaying(true);

      const tick = () => {
        const elapsed = ctx.currentTime - startRef.current;
        if (elapsed >= playSec) {
          setProgress(1); // onended resets shortly after
          return;
        }
        setProgress(elapsed / playSec);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      if (token !== playTokenRef.current) return; // superseded; stay quiet
      // Surface failures (decode error, failed fetch, unsupported codec)
      // instead of the button silently doing nothing.
      toast.error(t("error", { detail: describeError(err, currentFmt()) }), {
        id: "audio-error",
      });
      stop();
    }
  };

  const onPress = () => {
    triggerHaptic("medium");
    // While loading, a second press cancels (stop() bumps the play token).
    if (playing || loading) stop();
    else play();
  };

  const disabled = !previewUrl;

  return (
    <Card className="p-0 border-2 border-border shadow-lg">
      <CardContent className="relative aspect-square flex flex-col items-center justify-center text-center gap-5 px-6">
        <div className="absolute top-2 right-2">
          <VolumeControl variant="card" />
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("label")}
        </div>

        {modLabel && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-destructive/15 text-destructive text-2xs font-medium uppercase tracking-wider">
            {modLabel}
          </div>
        )}

        <button
          type="button"
          onClick={onPress}
          disabled={disabled}
          aria-busy={loading}
          aria-label={playing ? t("pause") : t("play")}
          className={cn(
            "relative h-24 w-24 rounded-full flex items-center justify-center transition-all",
            "bg-primary text-primary-foreground shadow-lg",
            "hover:scale-105 active:scale-95",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {/* Circular progress ring while playing */}
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.9"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - progress)}
              style={{ transition: playing ? undefined : "stroke-dashoffset 200ms" }}
            />
          </svg>
          {loading ? (
            <Loader2 className="h-9 w-9 relative animate-spin" />
          ) : playing ? (
            <Pause className="h-10 w-10 relative" fill="currentColor" />
          ) : progress > 0 ? (
            <RotateCcw className="h-9 w-9 relative" />
          ) : (
            <Play className="h-10 w-10 relative" fill="currentColor" />
          )}
        </button>

        <div className="space-y-0.5">
          <div className="text-2xl font-semibold tabular-nums leading-none">
            {t("duration", { seconds: durationSec })}
          </div>
          {totalLevels != null && (
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">
              {t("step", { current: level + 1, total: totalLevels })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
