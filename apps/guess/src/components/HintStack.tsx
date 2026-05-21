"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button, Card, SPRING_CONFIGS } from "@tomomai/ui";
import { cn } from "@tomomai/ui/utils";
import { useTranslations } from "next-intl";
import type { HintPayload, RevealPayload } from "@/lib/client-types";
import { debugTransition } from "@/lib/animation-debug";
import { HintCard } from "./HintCard";

type Revealed = { step: number; hint: HintPayload };

type Props = {
  hints: Revealed[];
  dateKey: string;
  /** Optional past-date slug; forwarded to HintCard so the image URL has it. */
  dateSlug?: string;
  reveal?: RevealPayload | null;
};

type DeckEntry =
  | { kind: "hint"; step: number; hint: HintPayload }
  | { kind: "reveal"; reveal: RevealPayload };

const REVEAL_PSEUDO_STEP = 9999;

/** Firefox's WebRender treats every filtered element as its own compositor
 *  pass and invalidates picture-cache tiles around it, so even a sub-pixel
 *  `blur(0.5px)` on 6–8 stacked cards tanks framerate. Chromium and WebKit
 *  composite the same filter cheaply, so we keep the subtle depth blur there.
 *  Detection runs once after mount so SSR markup stays stable. */
function useSupportsCheapFilter() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // `Firefox/` covers Firefox itself and Gecko-based forks (Zen, LibreWolf,
    // Waterfox). Chromium/Safari UAs only contain "like Gecko", not "Firefox/".
    const isFirefox = /Firefox\//.test(navigator.userAgent);
    setOk(!isFirefox);
  }, []);
  return ok;
}

/** Tiny deterministic PRNG so each card's jitter is stable across renders. */
function seededJitter(step: number): { rot: number; dx: number; dy: number } {
  let s = (step + 1) * 0x9e3779b1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000) / 1000;
  };
  const r = next();
  const a = next();
  const b = next();
  return {
    rot: (r - 0.5) * 4,
    dx: (a - 0.5) * 10,
    dy: (b - 0.5) * 6,
  };
}

export function HintStack({ hints, dateKey, dateSlug, reveal }: Props) {
  const supportsCheapFilter = useSupportsCheapFilter();
  const entries: DeckEntry[] = useMemo(() => {
    const out: DeckEntry[] = hints.map((h) => ({
      kind: "hint" as const,
      step: h.step,
      hint: h.hint,
    }));
    if (reveal) out.push({ kind: "reveal", reveal });
    return out;
  }, [hints, reveal]);

  const [active, setActive] = useState(entries.length - 1);
  // Render-time setActive (guarded by a ref): when entries grows, React
  // discards the in-progress render and immediately re-renders with the new
  // active index, so Framer never sees the in-between "active still pointing
  // to the previous card" state.
  const prevLengthRef = useRef(entries.length);
  if (prevLengthRef.current !== entries.length) {
    prevLengthRef.current = entries.length;
    setActive(entries.length - 1);
  }

  // Track which card keys we've already committed. Cards in this set get
  // `initial={false}` so Framer Motion uses their *current animated values*
  // as the starting state for the next prop change. Only brand-new keys get
  // the slide-in `initial`.
  //
  // Mutation lives in useEffect (not during render) — the render-time
  // setActive can discard renders, and mutating a ref during a discarded
  // render still sticks, which would falsely mark new cards as seen.
  const seenKeysRef = useRef<Set<string>>(new Set());
  const allKeys = entries.map((e) =>
    e.kind === "reveal" ? "reveal" : `hint-${e.step}`,
  );
  useEffect(() => {
    for (const k of allKeys) seenKeysRef.current.add(k);
  });

  const jitter = useMemo(() => {
    const map: Record<number, ReturnType<typeof seededJitter>> = {};
    for (const e of entries) {
      const key = e.kind === "reveal" ? REVEAL_PSEUDO_STEP : e.step;
      map[key] = seededJitter(key);
    }
    return map;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="relative h-72 sm:h-80 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const idx = Math.max(0, Math.min(active, entries.length - 1));
  const canPrev = idx > 0;
  const canNext = idx < entries.length - 1;

  return (
    <div className="space-y-3">
      <div className="relative h-72 sm:h-80 isolate">
        {/* Arrow buttons — z-[200] beats every card. */}
        <div className="absolute inset-y-0 -left-2 flex items-center z-[200] pointer-events-none">
          <Button
            size="icon"
            variant="outline"
            onClick={() => canPrev && setActive((i) => i - 1)}
            disabled={!canPrev}
            aria-label="Previous hint"
            className="h-10 w-10 rounded-full pointer-events-auto shadow-md backdrop-blur-sm bg-background/90"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="absolute inset-y-0 -right-2 flex items-center z-[200] pointer-events-none">
          <Button
            size="icon"
            variant="outline"
            onClick={() => canNext && setActive((i) => i + 1)}
            disabled={!canNext}
            aria-label="Next hint"
            className="h-10 w-10 rounded-full pointer-events-auto shadow-md backdrop-blur-sm bg-background/90"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Card clipper. Sibling of the arrow-button overlays so their
         * -left-2/-right-2 protrusion stays visible. Full-bleed horizontally
         * via `left/right: calc(-50vw + 50%)` so the clip box reaches the
         * actual viewport edges regardless of how many `px-*` ancestors wrap
         * the deck — without this, the clip stopped at the page's 16px
         * gutter and cards could still extend into it.
         * `overflow: hidden` (not `clip`) for Safari ≤15 + better behavior
         * with nested absolutely-positioned descendants on some Safari builds.
         * Cards are still centered by `left-1/2 -translate-x-1/2` relative
         * to the clipper, which is symmetric around the viewport center, so
         * card positions don't shift. */}
        <div
          className="absolute top-0 bottom-0 overflow-hidden"
          style={{
            left: "calc(-50vw + 50%)",
            right: "calc(-50vw + 50%)",
          }}
        >

          {entries.map((entry, i) => {
            const key =
              entry.kind === "reveal" ? `reveal` : `hint-${entry.step}`;
            const jitterKey =
              entry.kind === "reveal" ? REVEAL_PSEUDO_STEP : entry.step;
            const isNew = !seenKeysRef.current.has(key);
            const delta = i - idx;
            const j = jitter[jitterKey]!;
            const isActive = delta === 0;
            const absDelta = Math.abs(delta);

            const sideSign = delta < 0 ? -1 : delta > 0 ? 1 : 0;
            const lateralFan = sideSign * Math.min(absDelta, 4) * 18;
            const dropFan = Math.min(absDelta, 4) * 6;

            const x = isActive ? j.dx : lateralFan + j.dx * 0.6;
            const y = isActive ? j.dy : dropFan + j.dy * 0.6;
            const rotate = isActive
              ? j.rot * 0.4
              : sideSign * (4 + Math.min(absDelta, 4) * 1.5) + j.rot;
            const scale = isActive ? 1 : Math.max(0.86, 0.94 - absDelta * 0.02);
            // Keep opacity near 1 across the board so flipping cards doesn't
            // dip them through a cheap-looking fade. Depth comes from scale +
            // blur + drop-shadow now, not from heavy opacity changes.
            const opacity = isActive ? 1 : Math.max(0.78, 0.95 - absDelta * 0.05);
            const zIndex = 100 - absDelta;

            return (
              <motion.div
                key={key}
                className={cn(
                  "absolute left-1/2 top-0 w-full max-w-[260px] sm:max-w-[280px] -translate-x-1/2",
                  // box-shadow instead of filter: drop-shadow so cards stay
                  // GPU-composited on Firefox WebRender.
                  isActive
                    ? "shadow-[0_18px_30px_rgba(0,0,0,0.18)]"
                    : "shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
                )}
                // Static blur only on engines where filter is cheap (Blink /
                // WebKit). On Firefox it's omitted — see useSupportsCheapFilter.
                // No manual `will-change` either: Framer Motion toggles it
                // during animation; pinning it on idle cards just keeps every
                // card permanently promoted to its own GPU layer.
                // touchAction `pan-y` on the active card lets vertical page
                // scrolling still work while we capture horizontal swipes.
                style={{
                  zIndex,
                  touchAction: isActive ? "pan-y" : undefined,
                  filter:
                    supportsCheapFilter && !isActive ? "blur(0.5px)" : undefined,
                }}
                // Brand-new cards get the slide-in `initial`. Existing cards
                // get `initial={false}` so motion uses their *current* animated
                // values as the start of the next transition — that way an
                // already-fanned-out card doesn't snap back to (0,0) before
                // animating to its new fanned-out position.
                initial={
                  isNew
                    ? {
                      x: j.dx,
                      y: 80,
                      rotate: j.rot,
                      scale: 0.85,
                      opacity: 0,
                    }
                    : false
                }
                animate={{ x, y, rotate, scale, opacity }}
                // Custom spring: a bit of overshoot, but a small one, with a
                // longer settle so the bounce lingers instead of snapping shut.
                //   - Lower stiffness    → slower oscillation period
                //   - Slightly higher mass → drags the settle out
                //   - Damping tuned so the damping ratio sits ~0.57, giving
                //     ~11% peak overshoot (down from ~16%) over a longer arc.
                transition={debugTransition({
                  type: "spring" as const,
                  stiffness: 200,
                  damping: 17,
                  mass: 1.1,
                })}
                // Touch / pointer swipe support on the active card. Drag is
                // constrained to 0 with elasticity so the card visibly resists
                // and bounces back — onDragEnd decides whether the gesture
                // counted as a swipe by checking offset OR velocity.
                drag={isActive ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (!isActive) return;
                  const swipePx = 60;
                  const swipeVel = 350;
                  if (info.offset.x < -swipePx || info.velocity.x < -swipeVel) {
                    if (canNext) setActive((a) => a + 1);
                  } else if (info.offset.x > swipePx || info.velocity.x > swipeVel) {
                    if (canPrev) setActive((a) => a - 1);
                  }
                }}
                onClick={() => !isActive && setActive(i)}
                role={isActive ? undefined : "button"}
                aria-label={isActive ? undefined : `Go to card ${i + 1}`}
                tabIndex={isActive ? -1 : 0}
              >
                {entry.kind === "hint" ? (
                  <HintCard
                    step={entry.step}
                    hint={entry.hint}
                    dateKey={dateKey}
                    dateSlug={dateSlug}
                  />
                ) : (
                  <RevealCardInner reveal={entry.reveal} />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center gap-1.5">
        {entries.map((entry, i) => (
          <button
            key={entry.kind === "reveal" ? "reveal-dot" : `hint-dot-${entry.step}`}
            type="button"
            aria-label={`Go to card ${i + 1}`}
            onClick={() => setActive(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === idx
                ? "w-6 bg-primary"
                : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Reveal card body — same square frame as HintCard, dark pill at bottom-left. */
function RevealCardInner({ reveal }: { reveal: RevealPayload }) {
  const t = useTranslations("guess.reveal");
  return (
    <Card className="overflow-hidden p-0 border-2 border-border shadow-lg">
      <div className="relative aspect-square w-full bg-muted">
        {reveal.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reveal.cover}
            alt={reveal.songName}
            className="w-full h-full object-cover"
            draggable={false}
            decoding="sync"
            loading="eager"
            fetchPriority="high"
          />
        )}
        {/* Bottom-left semi-dark panel, baked into the image — no entry
            animation, so it reads as part of the card frame. No
            `backdrop-blur-*`: doesn't compose with the parent's `filter`,
            which made the panel render as transparent until the parent's
            filter animation finished. */}
        <div className="absolute bottom-2 left-2 right-2 bg-black/75 text-white px-3 py-2 rounded-lg space-y-0.5">
          <div className="text-2xs uppercase tracking-wider text-white/70">
            {t("answer")}
          </div>
          <div className="text-sm font-semibold leading-tight line-clamp-2">
            {reveal.songName}
          </div>
          <div className="text-xs text-white/80 line-clamp-1">
            {reveal.artist}
          </div>
          <div className="text-2xs text-white/70 pt-0.5">
            {reveal.difficulty} {reveal.level} · {reveal.type.toUpperCase()}
          </div>
        </div>
      </div>
    </Card>
  );
}
