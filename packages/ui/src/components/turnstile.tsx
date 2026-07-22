"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SCRIPT_ID = "tomomai-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type WidgetId = string;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): WidgetId;
  reset(widgetId: WidgetId): void;
  remove(widgetId: WidgetId): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        scriptPromise = null;
        reject(new Error("Turnstile API did not initialize"));
      }
    };
    const handleError = () => {
      cleanup();
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export interface TurnstileWidgetHandle {
  reset(): void;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, action, onToken, onExpire, onError, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<WidgetId | null>(null);
    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    const onErrorRef = useRef(onError);

    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }), []);

    useEffect(() => {
      let cancelled = false;

      void loadTurnstile()
        .then((turnstile) => {
          if (cancelled || !containerRef.current) return;
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            theme: "auto",
            size: "flexible",
            appearance: "interaction-only",
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => onExpireRef.current?.(),
            "error-callback": () => onErrorRef.current?.(),
          });
        })
        .catch(() => {
          if (!cancelled) onErrorRef.current?.();
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [action, siteKey]);

    return <div ref={containerRef} className={className} />;
  },
);

const PRECLEARANCE_SESSION_KEY = "tomomai-turnstile-precleared";

export interface TurnstilePreclearanceProps {
  siteKey: string;
  verifyPath?: string;
}

export function TurnstilePreclearance({
  siteKey,
  verifyPath = "/api/turnstile/verify",
}: TurnstilePreclearanceProps) {
  const widgetRef = useRef<TurnstileWidgetHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const verifyingRef = useRef(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    try {
      setCleared(sessionStorage.getItem(PRECLEARANCE_SESSION_KEY) === "1");
    } catch {
      // A blocked storage API should not prevent verification.
    }
  }, []);

  useEffect(() => {
    if (cleared || !overlayRef.current) return;

    const overlay = overlayRef.current;
    const parent = overlay.parentElement;
    if (!parent) return;

    const siblings = Array.from(parent.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlay,
    );
    const previous = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    const previousOverflow = document.body.style.overflow;

    for (const element of siblings) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";

    return () => {
      for (const state of previous) {
        if (!state.inert) state.element.removeAttribute("inert");
        if (state.ariaHidden === null) {
          state.element.removeAttribute("aria-hidden");
        } else {
          state.element.setAttribute("aria-hidden", state.ariaHidden);
        }
      }
      document.body.style.overflow = previousOverflow;
    };
  }, [cleared]);

  async function verify(token: string) {
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    try {
      const response = await fetch(verifyPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("Turnstile verification failed");

      try {
        sessionStorage.setItem(PRECLEARANCE_SESSION_KEY, "1");
      } catch {
        // The Cloudflare clearance cookie remains authoritative.
      }
      setCleared(true);
    } catch {
      widgetRef.current?.reset();
    } finally {
      verifyingRef.current = false;
    }
  }

  if (cleared) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Security verification"
      className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-6 backdrop-blur-md"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 size-7 animate-spin rounded-full border-2 border-muted border-t-primary"
        />
        <TurnstileWidget
          ref={widgetRef}
          siteKey={siteKey}
          action="site-access"
          onToken={verify}
          onExpire={() => widgetRef.current?.reset()}
          className="w-full"
        />
      </div>
    </div>
  );
}
