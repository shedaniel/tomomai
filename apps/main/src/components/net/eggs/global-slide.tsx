"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "./eggs";
import { useNetJudgement } from "./global-judgement";
import styles from "./global.module.css";

const WINDOW_MS = 2500;
const DOUBLE_WINDOW_MS = 5000;
const LOOP_TURN = (300 / 180) * Math.PI;
const DOUBLE_TURN = (720 / 180) * Math.PI;
const DRAW_TURN = (100 / 180) * Math.PI;
const LOOP_RADIUS = 80;
const DRAW_RADIUS = 45;
const STEP = 6;
const CHEVRON_GAP = 26;
const CHEVRON_MS = 700;
const SVG_NS = "http://www.w3.org/2000/svg";

type Point = { x: number; y: number; t: number };

function measure(points: Point[]) {
  let turn = 0;
  for (let i = 2; i < points.length; i++) {
    const a = Math.atan2(points[i - 1].y - points[i - 2].y, points[i - 1].x - points[i - 2].x);
    const b = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    turn += d;
  }
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const radius = points.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / points.length;
  return { turn: Math.abs(turn), radius };
}

function isTextField(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable]");
}

/** Draw a big loop anywhere, mouse button held or finger down, and it plays as a maimai slide. */
export function NetEggSlide() {
  const t = useTranslations("net.common.eggs.slide");
  const [judgement, judge] = useNetJudgement();
  const layer = useRef<SVGSVGElement>(null);
  const star = useRef<SVGGElement>(null);
  const label = t("label");

  useEffect(() => {
    let points: Point[] = [];
    let drawing = false;
    let slid = false;
    let sinceChevron = 0;

    const place = (from: Point, to: Point) => {
      const svg = layer.current;
      if (!svg) return;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      let at = CHEVRON_GAP - sinceChevron;
      while (at <= length) {
        const k = at / length;
        const chevron = document.createElementNS(SVG_NS, "path");
        chevron.setAttribute("d", "M-7 -9 L5 0 L-7 9 L-3 0 Z");
        chevron.setAttribute("transform", `translate(${from.x + (to.x - from.x) * k} ${from.y + (to.y - from.y) * k}) rotate(${angle})`);
        chevron.setAttribute("class", styles.chevron);
        svg.insertBefore(chevron, star.current);
        window.setTimeout(() => chevron.remove(), CHEVRON_MS);
        at += CHEVRON_GAP;
      }
      sinceChevron = length - (at - CHEVRON_GAP);
      star.current?.setAttribute("transform", `translate(${to.x} ${to.y}) rotate(${angle})`);
    };

    const reset = () => {
      points = [];
      drawing = false;
      slid = false;
      sinceChevron = 0;
      star.current?.setAttribute("visibility", "hidden");
    };

    const begin = (x: number, y: number, target: EventTarget | null) => {
      reset();
      if (isTextField(target)) return;
      points.push({ x, y, t: performance.now() });
    };

    const move = (x: number, y: number) => {
      const last = points[points.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) < STEP) return;
      const now = performance.now();
      const point = { x, y, t: now };
      points.push(point);
      while (points.length > 2 && now - points[0].t > DOUBLE_WINDOW_MS) points.shift();

      const double = measure(points);
      const recent = points.findIndex(p => now - p.t <= WINDOW_MS);
      const single = recent > 0 ? measure(points.slice(recent)) : double;
      const { turn, radius } = single;
      if (!drawing && turn >= DRAW_TURN && radius >= DRAW_RADIUS) {
        drawing = true;
        star.current?.setAttribute("visibility", "visible");
        for (let i = 1; i < points.length; i++) place(points[i - 1], points[i]);
      } else if (drawing) {
        place(last, point);
      }

      const isDouble = double.turn >= DOUBLE_TURN && double.radius >= LOOP_RADIUS;
      const isSingle = turn >= LOOP_TURN && radius >= LOOP_RADIUS;
      // The first loop pays out without ending the stroke so a second one can still become a double.
      if (isDouble || (isSingle && !slid)) {
        if (isDouble) reset();
        else slid = true;
        try {
          window.getSelection()?.removeAllRanges();
        } catch {
          // Nothing selected to clear.
        }
        judge({ grade: "criticalPerfect", label, big: true });
        findNetEgg(isDouble ? "doubleSlide" : "slide");
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      begin(event.clientX, event.clientY, event.target);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!(event.buttons & 1)) {
        if (points.length) reset();
        return;
      }
      move(event.clientX, event.clientY);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") reset();
    };
    // Touch moves keep arriving while the page scrolls, so a finger loop works without blocking the scroll.
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset();
      begin(event.touches[0].clientX, event.touches[0].clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset();
      move(event.touches[0].clientX, event.touches[0].clientY);
    };

    const listeners = [
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", onPointerEnd],
      ["pointercancel", onPointerEnd],
      ["touchstart", onTouchStart],
      ["touchmove", onTouchMove],
      ["touchend", reset],
      ["touchcancel", reset],
    ] as const;
    listeners.forEach(([name, listener]) => window.addEventListener(name, listener as EventListener, { passive: true }));
    return () => listeners.forEach(([name, listener]) => window.removeEventListener(name, listener as EventListener));
  }, [judge, label]);

  return (
    <>
      <svg ref={layer} className={styles.slideLayer} aria-hidden>
        <g ref={star} visibility="hidden">
          <path className={styles.slideStar} d="M0 -13 L3.8 -4.2 L12.4 -4 L5.6 2.2 L7.6 11 L0 6.2 L-7.6 11 L-5.6 2.2 L-12.4 -4 L-3.8 -4.2 Z" />
        </g>
      </svg>
      {judgement}
    </>
  );
}
