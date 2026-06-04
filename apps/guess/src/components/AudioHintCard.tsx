"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent } from "@tomomai/ui";
import { triggerHaptic } from "@tomomai/ui/haptics";
import { cn } from "@tomomai/ui/utils";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useVolume, volumeToAmplitude } from "@/lib/use-volume";
import { withAudioFormat } from "@/lib/audio-format";
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

/** Human-readable name for an HTMLMediaElement error code. */
const MEDIA_ERR_NAMES: Record<number, string> = {
  1: "aborted",
  2: "network",
  3: "decode",
  4: "src-not-supported",
};

/** Build a compact, technical description of an audio failure for the toast.
 * Surfaces the media element's own MediaError when present (decode/format
 * problems set this), otherwise the thrown error from `play()`. */
function describeAudioError(el: HTMLAudioElement | null, thrown?: unknown): string {
  // Tag with the negotiated container so a lingering failure says which path
  // (webm vs mp4) was tried.
  const fmt = /[?&]fmt=([^&]+)/.exec(el?.currentSrc ?? "")?.[1];
  const suffix = fmt ? ` (fmt=${fmt})` : "";
  const me = el?.error;
  if (me) {
    const name = MEDIA_ERR_NAMES[me.code] ?? `code ${me.code}`;
    return (me.message ? `${name} — ${me.message}` : name) + suffix;
  }
  if (thrown instanceof Error) {
    return (thrown.message ? `${thrown.name}: ${thrown.message}` : thrown.name) + suffix;
  }
  return (thrown ? String(thrown) : "unknown error") + suffix;
}

/**
 * Heardle audio hint card. Plays a clipped window (`durationSec`) of the
 * Apple Music preview starting from t=0. Each hint level reveals a longer
 * window; same URL across levels so playback is instant on re-press.
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of playSec
  const [volume] = useVolume();

  // The v2 route serves Opus/WebM or AAC/MP4; Safari can't decode the former,
  // so we negotiate the container client-side via canPlayType. We resolve the
  // URL only after mount: the empty initial state is identical on server and
  // client (no hydration mismatch) and, crucially, stops Safari from ever
  // fetching the unplayable bare (webm) URL before the format is chosen.
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc(withAudioFormat(previewUrl));
  }, [previewUrl]);

  // Keep the audio element's volume in sync with the persisted setting.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volumeToAmplitude(volume);
  }, [volume]);

  // Cleanly stop playback and clear timers.
  const stop = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    stopAtRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setProgress(0);
  };

  // Stop whenever URL or playback length changes (e.g. moving between cards).
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, playSec]);

  // Pause when this card stops being the active one — swipe, arrow buttons,
  // dot nav, submit, and skip all flip the deck through `isActive`.
  useEffect(() => {
    if (!isActive && playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const play = async () => {
    const a = audioRef.current;
    if (!a || !previewUrl) return;
    try {
      a.currentTime = 0;
      await a.play();
    } catch (err) {
      // Surface the failure so issues like Safari refusing the codec, an
      // autoplay-policy block, or a failed fetch are visible instead of the
      // button silently doing nothing.
      toast.error(t("error", { detail: describeAudioError(a, err) }), {
        id: "audio-error",
      });
      return;
    }
    setPlaying(true);
    stopAtRef.current = performance.now() + playSec * 1000;
    const tick = () => {
      if (stopAtRef.current == null) return;
      const remaining = stopAtRef.current - performance.now();
      if (remaining <= 0) {
        // Subtle tactile cue that the clip just ended — distinct from the
        // firmer "medium" press the user feels when they trigger play/pause.
        triggerHaptic("soft");
        stop();
        return;
      }
      setProgress(1 - remaining / (playSec * 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPress = () => {
    triggerHaptic("medium");
    if (playing) stop();
    else play();
  };

  const disabled = !previewUrl;

  return (
    <Card className="p-0 border-2 border-border shadow-lg">
      <CardContent className="relative aspect-square flex flex-col items-center justify-center text-center gap-5 px-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          // Omit (rather than empty) when there's no clip: an empty src
          // resolves to the page URL and would fire a bogus load error.
          src={src || undefined}
          preload="auto"
          onEnded={stop}
          onError={() => {
            const a = audioRef.current;
            // Ignore aborts — those come from our own src swap (format
            // negotiation) or stop(), not a real failure. Surface genuine
            // load/decode errors (bad fetch, unsupported codec). Shares an id
            // with the play() catch so the two paths collapse into one toast.
            if (!a?.error || a.error.code === a.error.MEDIA_ERR_ABORTED) return;
            toast.error(t("error", { detail: describeAudioError(a) }), {
              id: "audio-error",
            });
          }}
        />

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
          {playing ? (
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
