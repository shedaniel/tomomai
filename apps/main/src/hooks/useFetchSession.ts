import { useState, useRef, useCallback, useMemo } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Region, FetchSession } from "@/lib/types";
import { Flags } from "@/lib/flags";
import { isTokenError, isAlbumSettingsError, isCnCookiesSingleUseError } from "@/lib/token-errors";
import { parseStatusStates } from "@/lib/fetch-states";
import { FetchToastState } from "@/components/fetch-toast";

// What the SSE subscription should watch. `sessionId` present → watch that
// specific session; absent → detect-and-watch the next new session (the
// external token-submit flow). null → idle, no subscription.
interface WatchTarget {
  region: Region;
  sessionId?: string;
}

export function useFetchSession(onFetchComplete?: () => void, flags?: Flags, onTokenError?: () => void, onUseAlbumError?: () => void, onCnCookiesExpired?: () => void) {
  const [currentSession, setCurrentSession] = useState<FetchSession | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  // Drives a single SSE subscription (trpc.user.onFetchStatus). null = idle.
  const [watchTarget, setWatchTarget] = useState<WatchTarget | null>(null);
  // True only while waiting for an externally-submitted token to create a
  // session (detect mode, before the session is observed).
  const [isDetecting, setIsDetecting] = useState(false);

  const onSessionDetectedRef = useRef<(() => void) | undefined>(undefined);
  // Guards the one-time "session detected" side effects. False only while in
  // detect mode (startSessionPolling) before the new session is observed;
  // true in session mode (startFetch) where the session is already known.
  const detectedRef = useRef(false);

  // Single push-based subscription. Replaces the old getLatestFetchSessionId
  // (1s) and getFetchStatus (0.5s) polling loops.
  trpc.user.onFetchStatus.useSubscription(
    watchTarget
      ? { region: watchTarget.region, sessionId: watchTarget.sessionId }
      : skipToken,
    {
      onData: (status) => {
        // First emission in detect mode means a new session was created.
        if (!detectedRef.current) {
          detectedRef.current = true;
          setIsDetecting(false);
          setLastFetchTime(new Date());
          toast.success("Token submitted successfully");
          onSessionDetectedRef.current?.();
        }

        const updatedSession: FetchSession = {
          id: status.id,
          status: status.status,
          startedAt: status.startedAt,
          completedAt: status.completedAt ?? undefined,
          errorMessage: status.errorMessage ?? undefined,
          statusStates: status.statusStates ?? undefined,
        };
        setCurrentSession(updatedSession);

        if (status.status === "completed") {
          if (status.notFoundScores && status.notFoundScores.length > 0) {
            toast.warning(`${status.notFoundScores.length} songs not found in database`, {
              description: status.notFoundScores.map((score) => `${score.songName} (${score.difficulty})`).join(", "),
            });
          }
          onFetchComplete?.();
          setWatchTarget(null); // terminal — close the subscription
        } else if (status.status === "failed") {
          const errorMessage = status.errorMessage || "Fetch failed";
          setFetchError(errorMessage);
          if (isTokenError(errorMessage)) onTokenError?.();
          if (isAlbumSettingsError(errorMessage)) onUseAlbumError?.();
          setWatchTarget(null); // terminal — close the subscription
        }
      },
      onError: (error) => {
        // Transient connection drops shouldn't be surfaced as fetch failures —
        // the DB session status remains the source of truth and the link will
        // reconnect. Log for visibility only.
        console.error("Fetch status subscription error:", error);
      },
    }
  );

  // tRPC mutation for starting fetch
  const startFetchMutation = trpc.user.startFetch.useMutation({
    onSuccess: (data, variables) => {
      const session: FetchSession = {
        id: data.sessionId,
        status: "pending",
        startedAt: new Date(),
      };
      setCurrentSession(session);
      setLastFetchTime(new Date());
      setFetchError(null);

      // Watch this specific session via the subscription.
      detectedRef.current = true; // session is already known; skip detect logic
      setIsDetecting(false);
      setWatchTarget({ region: variables.region, sessionId: data.sessionId });
    },
    onError: (error) => {
      if (isAlbumSettingsError(error.message) && !!onUseAlbumError) {
        onUseAlbumError?.();
        return;
      }
      if (isCnCookiesSingleUseError(error.message) && !!onCnCookiesExpired) {
        onCnCookiesExpired();
      }
      setFetchError(error.message);
    },
  });

  // Start data fetch with optional token (if no token, uses saved token)
  const startDataFetch = async (region: Region, token?: string): Promise<void> => {
    setFetchError(null);

    // Build flags array for fetch
    const fetchFlags: string[] = [];
    if (flags?.eventsCard) {
      fetchFlags.push("eventsCard");
    }

    // Let the mutation error bubble up to the caller
    await startFetchMutation.mutateAsync({ region, token, flags: fetchFlags });
  };

  // Start automatic fetch using saved token
  const startAutomaticFetch = async (region: Region): Promise<void> => {
    return startDataFetch(region); // No token provided, will use saved token
  };

  const resetFetchSession = useCallback(() => {
    setCurrentSession(null);
    setFetchError(null);
  }, []);

  // Start watching for a session created by the external token-submit flow.
  const startSessionPolling = useCallback((region: Region, onSessionDetected?: () => void) => {
    detectedRef.current = false;
    onSessionDetectedRef.current = onSessionDetected;
    setFetchError(null);
    setIsDetecting(true);
    setWatchTarget({ region }); // detect mode — no sessionId
  }, []);

  // Stop watching for a new session.
  const stopSessionPolling = useCallback(() => {
    setIsDetecting(false);
    detectedRef.current = false;
    onSessionDetectedRef.current = undefined;
    // Only tear down the subscription if we were still in detect mode; once a
    // session is being watched we let it run to completion.
    setWatchTarget((prev) => (prev && !prev.sessionId ? null : prev));
  }, []);

  const isFetching = currentSession?.status === "pending" || startFetchMutation.isPending;

  // Compute the fetch toast state from the current session
  const fetchToastState: FetchToastState | null = useMemo(() => {
    if (!currentSession) return null;

    return {
      id: currentSession.id,
      status: currentSession.status,
      statusStates: parseStatusStates(currentSession.statusStates ?? null),
      startedAt: currentSession.startedAt,
      errorMessage: currentSession.errorMessage,
    };
  }, [currentSession]);

  return {
    currentSession,
    fetchError,
    lastFetchTime,
    isFetching,
    startDataFetch,
    startAutomaticFetch,
    resetFetchSession,
    startSessionPolling,
    stopSessionPolling,
    isPollingForSession: isDetecting,
    fetchToastState,
  };
}
