"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  FetchState,
  FETCH_STATES,
  calculateProgress,
} from "@/lib/fetch-states";
import { useTranslations } from "next-intl";

export type FetchToastStatus = "pending" | "completed" | "failed";

export interface FetchToastState {
  id: string;
  status: FetchToastStatus;
  statusStates: FetchState[];
  startedAt: Date;
  errorMessage?: string;
}

interface FetchToastProps {
  state: FetchToastState;
  onDismiss?: () => void;
}

function getProgress(statusStates: FetchState[]): number {
  if (statusStates.length === 0) return 3; // Show a little progress at start
  return calculateProgress(statusStates);
}

function getStatusLabelKey(state: FetchState): string {
  switch (state) {
    case FETCH_STATES.LOGIN:
      return "states.login";
    case FETCH_STATES.PLAYER_DATA:
      return "states.playerData";
    case FETCH_STATES.SONG_DATA_EASY:
      return "states.songDataBasic";
    case FETCH_STATES.SONG_DATA_ADVANCED:
      return "states.songDataAdvanced";
    case FETCH_STATES.SONG_DATA_EXPERT:
      return "states.songDataExpert";
    case FETCH_STATES.SONG_DATA_MASTER:
      return "states.songDataMaster";
    case FETCH_STATES.SONG_DATA_REMASTER:
      return "states.songDataRemaster";
    case FETCH_STATES.RECENT_SONGS:
      return "states.recentSongs";
    case FETCH_STATES.HIDDEN_SONGS:
      return "states.hiddenSongs";
    default:
      return state;
  }
}

function formatTimestamp(elapsedMs: number): string {
  const totalSeconds = elapsedMs / 1000;
  if (totalSeconds < 60) {
    return `+${totalSeconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `+${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function StatusLine({
  state,
  elapsedMs,
  label,
}: {
  state: FetchState;
  elapsedMs: number;
  label: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
      }}
      className="flex items-center gap-2 text-xs font-mono"
    >
      <span className="text-muted-foreground/60 shrink-0">
        {formatTimestamp(elapsedMs)}
      </span>
      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
      <span className="text-foreground/80 truncate">
        {label}
      </span>
    </motion.div>
  );
}

export function FetchToast({ state, onDismiss }: FetchToastProps) {
  const t = useTranslations("fetchToast");
  const { status, statusStates, startedAt, errorMessage } = state;
  const progress = status === "completed" ? 100 : status === "failed" ? 0 : getProgress(statusStates);

  // Track when each state was first seen (stores elapsed ms from startedAt)
  const stateTimestampsRef = React.useRef<Map<FetchState, number>>(new Map());

  // Record timestamps for new states immediately
  const now = Date.now();
  const elapsedFromStart = now - startedAt.getTime();
  for (const s of statusStates) {
    if (!stateTimestampsRef.current.has(s)) {
      stateTimestampsRef.current.set(s, elapsedFromStart);
    }
  }

  // Reset timestamps when session changes
  const sessionIdRef = React.useRef(state.id);
  React.useEffect(() => {
    if (state.id !== sessionIdRef.current) {
      stateTimestampsRef.current.clear();
      sessionIdRef.current = state.id;
    }
  }, [state.id]);

  // Track elapsed time for the header - update every 100ms for smoother display
  const [elapsedMs, setElapsedMs] = React.useState(() => Date.now() - startedAt.getTime());

  React.useEffect(() => {
    if (status === "pending") {
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - startedAt.getTime());
      }, 100);
      return () => clearInterval(interval);
    }
  }, [status, startedAt]);

  const formatElapsedMs = (ms: number) => {
    const totalSeconds = ms / 1000;
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getStateTimestampMs = (s: FetchState): number => {
    return stateTimestampsRef.current.get(s) ?? 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "w-[360px] rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden",
        status === "failed" && "border-destructive/50"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {status === "pending" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "completed" && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {status === "failed" && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium text-sm">
            {t(`header.${status}`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "pending" && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatElapsedMs(elapsedMs)}
            </span>
          )}
          {(status === "completed" || status === "failed") && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3">
        <Progress
          value={progress}
          className={cn(
            "h-2",
            status === "failed" && "[&>div]:bg-destructive"
          )}
        />
      </div>

      {/* Console-style status log */}
      <div className="px-4 pb-3 max-h-[250px] overflow-y-auto">
        <div className="space-y-1">
          {/* Initial "Connecting..." line - always shown first */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-muted-foreground/60 shrink-0">
              {formatTimestamp(0)}
            </span>
            {statusStates.length === 0 && status === "pending" ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            )}
            <span className={cn(
              "truncate",
              statusStates.length === 0 && status === "pending"
                ? "text-muted-foreground"
                : "text-foreground/80"
            )}>
              {statusStates.length === 0 && status === "pending"
                ? t("states.connecting")
                : t("states.connected")}
            </span>
          </div>

          <AnimatePresence mode="popLayout">
            {statusStates.map((s) => (
              <StatusLine
                key={s}
                state={s}
                elapsedMs={getStateTimestampMs(s)}
                label={t(getStatusLabelKey(s))}
              />
            ))}
          </AnimatePresence>

          {/* Error message */}
          {status === "failed" && errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 text-xs font-mono mt-2 pt-2 border-t border-destructive/20"
            >
              <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
              <span className="text-destructive">
                {errorMessage}
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Toast container component that manages the fetch toast
interface FetchToastContainerProps {
  state: FetchToastState | null;
  onDismiss?: () => void;
}

export function FetchToastContainer({ state, onDismiss }: FetchToastContainerProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const lastStateIdRef = React.useRef<string | null>(null);

  // Reset dismissed state when a new fetch session starts
  React.useEffect(() => {
    if (state && state.id !== lastStateIdRef.current) {
      setDismissed(false);
      lastStateIdRef.current = state.id;
    }
  }, [state]);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // Auto-dismiss after completion (with delay)
  React.useEffect(() => {
    if (state?.status === "completed") {
      const timer = setTimeout(() => {
        setDismissed(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state?.status]);

  const showToast = state && !dismissed;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      <AnimatePresence>
        {showToast && (
          <div className="pointer-events-auto">
            <FetchToast state={state} onDismiss={handleDismiss} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
