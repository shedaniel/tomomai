"use client";

import { useEffect, useRef, useState } from "react";

interface AltchaWidgetProps {
  onSolve: (payload: string) => void;
  onError?: () => void;
  className?: string;
}

let workerRegistered = false;

async function ensureAlgorithmsRegistered() {
  if (workerRegistered) return;
  await import("altcha");
  const g = globalThis as typeof globalThis & {
    $altcha?: { algorithms: Map<string, () => Worker> };
  };
  if (!g.$altcha) return;
  if (!g.$altcha.algorithms.has("ARGON2ID")) {
    g.$altcha.algorithms.set(
      "ARGON2ID",
      () => new Worker("/altcha/argon2id.js", { type: "module" }),
    );
  }
  workerRegistered = true;
}

export function AltchaWidget({ onSolve, onError, className }: AltchaWidgetProps) {
  const ref = useRef<HTMLElement>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await ensureAlgorithmsRegistered();
      if (!cancelled) setInitialized(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleStateChange = async (e: Event) => {
      const detail = (e as CustomEvent<{ state: string; payload: string }>).detail;
      if (detail?.state === "verified" && detail.payload) {
        // Stateless pre-verify for UX feedback. The authoritative check
        // (and single-use claim) happens server-side on the gated endpoint.
        try {
          const res = await fetch("/api/altcha/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: detail.payload }),
          });
          if (!res.ok) {
            onError?.();
            return;
          }
        } catch {
          onError?.();
          return;
        }
        onSolve(detail.payload);
      } else if (detail?.state === "error") {
        onError?.();
      }
    };

    el.addEventListener("statechange", handleStateChange);
    return () => el.removeEventListener("statechange", handleStateChange);
  }, [onSolve, onError, initialized]);

  if (!initialized) return null;

  // @ts-expect-error - altcha-widget is a custom element registered at runtime
  return <altcha-widget ref={ref} challenge="/api/altcha/challenge" hidefooter hidelogo style={{ display: "block", width: "100%" }} class={className} />;
}
