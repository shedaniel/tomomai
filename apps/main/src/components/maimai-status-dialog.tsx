"use client";

import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Download, Hourglass, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

const STATUS_REGIONS: Region[] = ["intl", "jp"];
// Don't ask again when a "fetch anyway" leads straight into the token dialog.
const BUSY_ACCEPTED_MS = 5 * 60_000;

type GateState =
  | { kind: "locked"; until: number; total: number }
  | { kind: "busy" };

/**
 * Checks maimai DX NET's shared status before a fetch starts. confirmFetch
 * resolves true straight away when nothing is wrong, otherwise once the user
 * has answered the dialog rendered by gateDialog.
 */
export function useMaimaiFetchGate(region: Region) {
  const utils = trpc.useUtils();
  const [state, setState] = useState<GateState | null>(null);
  const resolveRef = useRef<((proceed: boolean) => void) | null>(null);
  const busyAcceptedAt = useRef(0);

  const confirmFetch = useCallback(async (): Promise<boolean> => {
    if (!STATUS_REGIONS.includes(region)) return true;
    let status;
    try {
      status = await utils.user.getMaimaiStatus.fetch({ region }, { staleTime: 0 });
    } catch {
      return true;
    }
    if (!status.locked && (!status.busy || Date.now() - busyAcceptedAt.current < BUSY_ACCEPTED_MS)) return true;
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState(status.locked
        ? { kind: "locked", until: Date.now() + status.retryAfterSeconds * 1000, total: status.retryAfterSeconds }
        : { kind: "busy" });
    });
  }, [region, utils]);

  const answer = useCallback((proceed: boolean) => {
    if (proceed && state?.kind === "busy") busyAcceptedAt.current = Date.now();
    resolveRef.current?.(proceed);
    resolveRef.current = null;
    setState(null);
  }, [state]);

  return {
    confirmFetch,
    gateDialog: <MaimaiStatusDialog state={state} onAnswer={answer} />,
  };
}

function MaimaiStatusDialog({ state, onAnswer }: { state: GateState | null; onAnswer: (proceed: boolean) => void }) {
  const t = useTranslations("maimaiStatus");
  const [shown, setShown] = useState<GateState | null>(state);
  if (state && state !== shown) setShown(state);

  return (
    <ResponsiveDialog open={!!state} onOpenChange={(open) => !open && onAnswer(false)}>
      <ResponsiveDialogContent className="sm:max-w-[420px]">
        {shown?.kind === "locked" && <LockedContent state={shown} onAnswer={onAnswer} t={t} />}
        {shown?.kind === "busy" && <BusyContent onAnswer={onAnswer} t={t} />}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

type Translate = ReturnType<typeof useTranslations<"maimaiStatus">>;

function StatusHeader({ badge, title, description, children }: { badge: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <ResponsiveDialogHeader className="items-center gap-3 text-center sm:text-center">
      {children}
      <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        {badge}
      </span>
      <ResponsiveDialogTitle className="text-xl leading-snug">{title}</ResponsiveDialogTitle>
      <ResponsiveDialogDescription className="text-center text-sm leading-relaxed">{description}</ResponsiveDialogDescription>
    </ResponsiveDialogHeader>
  );
}

function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function LockedContent({ state, onAnswer, t }: { state: Extract<GateState, { kind: "locked" }>; onAnswer: (proceed: boolean) => void; t: Translate }) {
  const secondsLeft = useSecondsLeft(state.until);
  const ready = secondsLeft === 0;
  const fraction = state.total > 0 ? secondsLeft / state.total : 0;
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <>
      <StatusHeader badge={t("lockedBadge")} title={t("lockedTitle")} description={t("lockedDescription")}>
        <div
          className="relative grid size-32 place-items-center"
          role="timer"
          aria-label={ready ? t("ready") : t("retryIn", { time: clock })}
        >
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-primary/15" />
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
              className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div className="flex flex-col items-center">
            {ready ? (
              <Download className="size-8 text-primary" />
            ) : (
              <>
                <Hourglass className="mb-1 size-4 text-primary" />
                <span className="text-2xl font-semibold tabular-nums text-foreground">{clock}</span>
              </>
            )}
          </div>
        </div>
      </StatusHeader>
      {ready && <p className="text-center text-sm font-medium text-primary">{t("ready")}</p>}
      <ResponsiveDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
        {ready ? (
          <Button className="w-full sm:w-auto" onClick={() => onAnswer(true)}>
            <Download className="h-4 w-4" />
            {t("fetchNow")}
          </Button>
        ) : (
          <Button className="w-full sm:w-auto sm:min-w-32" onClick={() => onAnswer(false)}>
            {t("gotIt")}
          </Button>
        )}
      </ResponsiveDialogFooter>
    </>
  );
}

function BusyContent({ onAnswer, t }: { onAnswer: (proceed: boolean) => void; t: Translate }) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <StatusHeader badge={t("busyBadge")} title={t("busyTitle")} description={t("busyDescription")}>
        <div className="relative grid size-32 place-items-center">
          <div className="absolute inset-2 rounded-full bg-primary/5" />
          <div className="absolute inset-6 rounded-full bg-primary/10" />
          <div className="relative flex flex-col items-center gap-2">
            <Users className="size-7 text-primary" />
            <div className="flex h-5 items-end gap-1" aria-hidden>
              {[0.6, 1, 0.75, 0.9].map((peak, i) => (
                <motion.span
                  key={i}
                  className={cn("w-1.5 origin-bottom rounded-full bg-primary", i % 2 ? "opacity-80" : "opacity-60")}
                  style={{ height: "100%" }}
                  initial={{ scaleY: peak }}
                  animate={reduceMotion ? undefined : { scaleY: [peak, 0.3, peak] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        </div>
      </StatusHeader>
      <ResponsiveDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => onAnswer(false)}>
          {t("later")}
        </Button>
        <Button className="w-full sm:w-auto" onClick={() => onAnswer(true)}>
          <Download className="h-4 w-4" />
          {t("fetchAnyway")}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}
