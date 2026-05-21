"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, Volume1, VolumeX } from "lucide-react";
import { Slider } from "@tomomai/ui";
import { cn } from "@tomomai/ui/utils";
import { useVolume } from "@/lib/use-volume";

type Props = {
  /** Override styling — defaults to a small dark pill suitable on top of
   *  cover art. Set to `"card"` for a lighter variant for use on light cards. */
  variant?: "overlay" | "card";
  className?: string;
};

/**
 * Persisted volume slider, opens as a popover from a speaker icon button.
 * Volume state lives in module memory + localStorage so all audio elements
 * share the same value.
 */
export function VolumeControl({ variant = "card", className }: Props) {
  const [volume, setVolume] = useVolume();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Anchor the portaled popover to the trigger's bounding rect. Recomputes
  // on open and on viewport resize/scroll while open.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const POP_WIDTH = 224; // matches w-56 below
      setCoords({
        top: r.bottom + 8,
        left: Math.min(r.right - POP_WIDTH, window.innerWidth - POP_WIDTH - 8),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Click outside / Escape to close. Need to check both the trigger and the
  // portaled popover — the popover lives outside the trigger's DOM subtree.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const popover =
    open && coords && mounted
      ? createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className={cn(
              "z-[300] w-56",
              "rounded-lg border bg-popover text-popover-foreground shadow-lg",
              "px-3 py-2 flex items-center gap-3",
            )}
            role="dialog"
            aria-label="Volume"
          >
            <button
              type="button"
              onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
            </button>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={([v]) => setVolume(v ?? 0)}
              aria-label="Volume slider"
              className="flex-1 min-w-0"
            />
            <span className="text-2xs tabular-nums text-muted-foreground w-7 text-right shrink-0">
              {Math.round(volume * 100)}
            </span>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Volume"
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center transition",
          variant === "overlay"
            ? "bg-black/70 text-white hover:bg-black/85"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
      {popover}
    </div>
  );
}
