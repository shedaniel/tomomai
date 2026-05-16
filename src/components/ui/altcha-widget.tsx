"use client";

import { useEffect, useRef } from "react";

interface AltchaWidgetProps {
  onSolve: (payload: string) => void;
  onError?: () => void;
  className?: string;
}

export function AltchaWidget({ onSolve, onError, className }: AltchaWidgetProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    import("altcha");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleStateChange = (e: Event) => {
      const detail = (e as CustomEvent<{ state: string; payload: string }>).detail;
      if (detail?.state === "verified" && detail.payload) {
        onSolve(detail.payload);
      } else if (detail?.state === "error") {
        onError?.();
      }
    };

    el.addEventListener("statechange", handleStateChange);
    return () => el.removeEventListener("statechange", handleStateChange);
  }, [onSolve, onError]);

  // @ts-expect-error - altcha-widget is a custom element registered at runtime
  return <altcha-widget ref={ref} challenge="/api/altcha/challenge" hidefooter hidelogo style={{ display: "block", width: "100%" }} class={className} />;
}
