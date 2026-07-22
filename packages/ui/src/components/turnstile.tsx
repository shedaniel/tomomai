"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

const SCRIPT_ID = "tomomai-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const PRECLEARANCE_TITLES = {
  en: "Verifying you're not a robot",
  ja: "ロボットでないかの確認中",
  ko: "로봇 여부 확인 중",
  zhHans: "正在进行人机验证",
  zhHant: "正在進行人機驗證",
} as const;

function resolvePreclearanceTitle(languages: readonly string[]): string {
  for (const language of languages) {
    const locale = language.toLowerCase();
    if (locale.startsWith("ja")) return PRECLEARANCE_TITLES.ja;
    if (locale.startsWith("ko")) return PRECLEARANCE_TITLES.ko;
    if (locale.startsWith("zh")) {
      return /(?:-|_)(?:hk|mo|tw)|hant/.test(locale)
        ? PRECLEARANCE_TITLES.zhHant
        : PRECLEARANCE_TITLES.zhHans;
    }
    if (locale.startsWith("en")) return PRECLEARANCE_TITLES.en;
  }
  return PRECLEARANCE_TITLES.en;
}

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
  appearance?: "always" | "execute" | "interaction-only";
  theme?: "app" | "auto" | "dark" | "light";
  size?: "compact" | "flexible" | "normal";
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget(
    {
      siteKey,
      action,
      appearance = "interaction-only",
      theme = "auto",
      size = "flexible",
      onToken,
      onExpire,
      onError,
      className,
    },
    ref,
  ) {
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
          const resolvedTheme =
            theme === "app"
              ? document.documentElement.classList.contains("dark") ? "dark" : "light"
              : theme;
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            theme: resolvedTheme,
            size,
            appearance,
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
    }, [action, appearance, siteKey, size, theme]);

    return <div ref={containerRef} className={className} />;
  },
);

const PRECLEARANCE_SESSION_KEY = "tomomai-turnstile-precleared";

export interface TurnstilePreclearanceProps {
  siteKey: string;
  verifyPath?: string;
  preview?: boolean;
}

export function TurnstilePreclearance({
  siteKey,
  verifyPath = "/api/turnstile/verify",
  preview = false,
}: TurnstilePreclearanceProps) {
  const widgetRef = useRef<TurnstileWidgetHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const verifyingRef = useRef(false);
  const [cleared, setCleared] = useState(false);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    setTitle(resolvePreclearanceTitle(navigator.languages));
  }, []);

  useEffect(() => {
    if (preview) return;
    try {
      setCleared(sessionStorage.getItem(PRECLEARANCE_SESSION_KEY) === "1");
    } catch {
      // A blocked storage API should not prevent verification.
    }
  }, [preview]);

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
    if (preview) return;
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
      aria-label={title ?? "Security verification"}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6 text-foreground"
    >
      <div className={`w-full max-w-lg space-y-6 ${title ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-full bg-muted p-3">
            <ShieldCheck className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex justify-center">
          <TurnstileWidget
            ref={widgetRef}
            siteKey={siteKey}
            action="site-access"
            appearance={preview ? "always" : "interaction-only"}
            theme="app"
            size="normal"
            onToken={verify}
            onExpire={() => widgetRef.current?.reset()}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
