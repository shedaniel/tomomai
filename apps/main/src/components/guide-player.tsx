"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState } from "react";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * A control to point at, the area the zoom should keep in view around it, and the value to choose there.
 * `label` is a key under common.guideLabels in the messages.
 */
export type GuideTarget = Rect & { label: string; focus?: Rect; value?: string };

/** One screenshot of a walkthrough and the controls on it, in the CSS pixels of the captured viewport. */
export type GuideFrame = {
  src: string;
  viewport: { width: number; height: number };
  targets: readonly GuideTarget[];
};

type Shot = { frame: number; target: number | null };

const ZOOM_MAX = 2;
const OVERVIEW_MS = 1600;
const TARGET_MS = 3600;

/** Overview of each frame, then each of its targets in turn. */
function shotsOf(frames: readonly GuideFrame[]): Shot[] {
  return frames.flatMap((frame, index) => [
    { frame: index, target: null },
    ...frame.targets.map((_, target) => ({ frame: index, target })),
  ]);
}

/** Scale and offset, as fractions of the frame, that center the target with some context around it. */
function cameraFor(frame: GuideFrame, target: GuideTarget | null): { scale: number; x: number; y: number } {
  if (!target) return { scale: 1, x: 0, y: 0 };
  const { width, height } = frame.viewport;
  const area = target.focus ?? target;
  const fill = target.focus ? 0.85 : 0.45;
  const scale = Math.min(ZOOM_MAX, Math.max(1, Math.min((width * fill) / area.width, (height * fill) / area.height)));
  const cx = (area.x + area.width / 2) / width;
  const cy = (area.y + area.height / 2) / height;
  const clamp = (offset: number) => Math.min(0, Math.max(1 - scale, offset));
  return { scale, x: clamp(0.5 - cx * scale), y: clamp(0.5 - cy * scale) };
}

function Arrow({ left, top, animate }: { left: number; top: number; animate: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="pointer-events-none absolute h-10 w-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
      initial={animate ? { opacity: 0, x: 28, y: 28 } : false}
      animate={animate ? { opacity: 1, x: [10, 2, 10], y: [10, 2, 10] } : { opacity: 1, x: 6, y: 6 }}
      transition={animate ? { opacity: { duration: 0.25 }, x: { duration: 1, repeat: Infinity, ease: "easeInOut" }, y: { duration: 1, repeat: Infinity, ease: "easeInOut" } } : undefined}
    >
      <path d="M4 4 L20 40 L25 27 L38 22 Z" fill="#ef4444" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
    </motion.svg>
  );
}

function ControlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Plays a captured walkthrough: each screenshot, then a zoom onto every control with an arrow pointing at it. */
export function GuidePlayer({ frames, alt, className }: { frames: readonly GuideFrame[]; alt: string; className?: string }) {
  const t = useTranslations("common.guidePlayer");
  const labels = useTranslations("common.guideLabels");
  const caption = (target: GuideTarget) => labels(target.label as Parameters<typeof labels>[0]);
  const reducedMotion = useReducedMotion() ?? false;
  const shots = shotsOf(frames);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const shot = shots[Math.min(index, shots.length - 1)];
  const frame = frames[shot.frame];
  const target = shot.target === null ? null : frame.targets[shot.target];
  const camera = cameraFor(frame, target);
  const done = index === shots.length - 1;

  useEffect(() => {
    if (!playing || done) return;
    const timer = setTimeout(() => setIndex(i => i + 1), shot.target === null ? OVERVIEW_MS : TARGET_MS);
    return () => clearTimeout(timer);
  }, [playing, done, index, shot.target]);

  const jump = (to: number) => {
    setIndex(Math.max(0, Math.min(shots.length - 1, to)));
    setPlaying(false);
  };

  const box = target && {
    left: (target.x / frame.viewport.width) * camera.scale + camera.x,
    top: (target.y / frame.viewport.height) * camera.scale + camera.y,
    width: (target.width / frame.viewport.width) * camera.scale,
    height: (target.height / frame.viewport.height) * camera.scale,
  };
  const motionTransition = reducedMotion ? { duration: 0 } : { duration: 1, ease: [0.4, 0, 0.2, 1] as const };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="relative w-full overflow-hidden rounded-md border bg-muted"
        style={{ aspectRatio: `${frame.viewport.width} / ${frame.viewport.height}` }}
      >
        <motion.div
          className="absolute inset-0 origin-top-left"
          animate={{ scale: camera.scale, x: `${camera.x * 100}%`, y: `${camera.y * 100}%` }}
          transition={motionTransition}
        >
          {frames.map((f, i) => (
            <Image
              key={f.src}
              src={f.src}
              alt={i === shot.frame ? alt : ""}
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className={cn("object-cover transition-opacity duration-300", i === shot.frame ? "opacity-100" : "opacity-0")}
              priority={i === 0}
            />
          ))}
        </motion.div>

        {box && (
          <>
            <motion.div
              key={`ring-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute rounded-md ring-2 ring-red-500 ring-offset-2 ring-offset-transparent"
              style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
              initial={reducedMotion ? false : { opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reducedMotion ? { duration: 0 } : { delay: 0.8, duration: 0.35 }}
            />
            <Arrow key={`arrow-${index}`} left={box.left + box.width} top={box.top + box.height} animate={!reducedMotion} />
          </>
        )}
      </div>

      <div className="flex gap-1">
        {shots.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => jump(i)}
            aria-label={s.target === null ? t("screen", { number: s.frame + 1 }) : caption(frames[s.frame].targets[s.target])}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= index ? "bg-primary" : "bg-muted-foreground/25")}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <p className="min-h-4 flex-1 text-xs text-muted-foreground">
          {target && caption(target)}
          {target?.value && <> · <span className="font-medium text-foreground">{t("setTo", { value: target.value })}</span></>}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1">
          <ControlButton label={t("previous")} onClick={() => jump(index - 1)} disabled={index === 0}>
            <ChevronLeft className="h-4 w-4" />
          </ControlButton>
          <ControlButton
            label={t(done ? "replay" : playing ? "pause" : "play")}
            onClick={() => (done ? (setIndex(0), setPlaying(true)) : setPlaying(p => !p))}
          >
            {done ? <RotateCcw className="h-4 w-4" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </ControlButton>
          <ControlButton label={t("next")} onClick={() => jump(index + 1)} disabled={done}>
            <ChevronRight className="h-4 w-4" />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
