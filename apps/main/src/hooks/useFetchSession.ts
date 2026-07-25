import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc, trpcClient } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Region, FetchSession } from "@/lib/types";
import { isTokenError, isAlbumSettingsError, isCnCookiesSingleUseError } from "@/lib/token-errors";
import { parseStatusStates } from "@/lib/fetch-states";
import { FetchToastState } from "@/components/fetch-toast";

const SESSION_DETECTION_INTERVAL_MS = 3000;
const FETCH_STATUS_INTERVAL_MS = 2000;
const HIDDEN_TAB_RECHECK_INTERVAL_MS = 5000;

export function useFetchSession(onFetchComplete?: () => void, onTokenError?: () => void, onUseAlbumError?: () => void, onCnCookiesExpired?: () => void) {
  const [currentSession, setCurrentSession] = useState<FetchSession | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  // Session polling state
  const [sessionPollingEnabled, setSessionPollingEnabled] = useState(false);
  const [sessionPollingRegion, setSessionPollingRegion] = useState<Region | null>(null);
  const lastKnownSessionIdRef = useRef<string | null>(null);
  const onSessionDetectedRef = useRef<(() => void) | undefined>(undefined);
  const fetchPollingTimeoutRef = useRef<number | null>(null);
  const fetchPollingGenerationRef = useRef(0);

  // Poll for new fetch sessions (lightweight query)
  const { data: latestSessionData } = trpc.user.getLatestFetchSessionId.useQuery(
    { region: sessionPollingRegion! },
    {
      enabled: sessionPollingEnabled && sessionPollingRegion !== null,
      refetchInterval: SESSION_DETECTION_INTERVAL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    }
  );

  const pollFetchStatus = useCallback((sessionId: string, region: Region) => {
    const deadline = Date.now() + 5 * 60 * 1000;
    const generation = ++fetchPollingGenerationRef.current;

    if (fetchPollingTimeoutRef.current !== null) {
      window.clearTimeout(fetchPollingTimeoutRef.current);
      fetchPollingTimeoutRef.current = null;
    }

    const stopPolling = () => {
      if (fetchPollingTimeoutRef.current !== null) {
        window.clearTimeout(fetchPollingTimeoutRef.current);
        fetchPollingTimeoutRef.current = null;
      }
    };

    const poll = async () => {
      if (generation !== fetchPollingGenerationRef.current) return;
      if (Date.now() >= deadline) {
        stopPolling();
        setFetchError("Fetch timeout");
        return;
      }

      if (document.visibilityState === "hidden") {
        fetchPollingTimeoutRef.current = window.setTimeout(
          poll,
          Math.min(HIDDEN_TAB_RECHECK_INTERVAL_MS, deadline - Date.now()),
        );
        return;
      }

      try {
        const result = await trpcClient.user.getFetchStatus.query({ region });

        if (generation !== fetchPollingGenerationRef.current) return;

        if (result && result.id === sessionId) {
          const updatedSession: FetchSession = {
            id: result.id,
            status: result.status,
            startedAt: result.startedAt,
            completedAt: result.completedAt || undefined,
            errorMessage: result.errorMessage || undefined,
            statusStates: result.statusStates || undefined,
          };
          console.log("Fetch status updated for session " + sessionId + " on " + region + " region: " + JSON.stringify(updatedSession));
          setCurrentSession(updatedSession);

          if (result.status === "completed") {
            stopPolling();
            if (result.notFoundScores && result.notFoundScores.length > 0) {
              toast.warning(`${result.notFoundScores.length} songs not found in database`, {
                description: result.notFoundScores.map(score => `${score.songName} (${score.difficulty})`).join(", "),
              });
            }
            onFetchComplete?.();
            return;
          }

          if (result.status === "failed") {
            stopPolling();
            const errorMessage = result.errorMessage || "Fetch failed";
            setFetchError(errorMessage);

            if (isTokenError(errorMessage)) {
              onTokenError?.();
            }
            if (isAlbumSettingsError(errorMessage)) {
              onUseAlbumError?.();
            }
            return;
          }
        } else if (!result) {
          stopPolling();
          setFetchError("Fetch session not found");
          return;
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          stopPolling();
          setFetchError("Fetch timeout");
          return;
        }
        fetchPollingTimeoutRef.current = window.setTimeout(poll, Math.min(FETCH_STATUS_INTERVAL_MS, remaining));
      } catch (error) {
        if (generation !== fetchPollingGenerationRef.current) return;
        stopPolling();
        console.error("Error polling fetch status:", error);
        setFetchError("Failed to check fetch status");
      }
    };

    void poll();
  }, [onFetchComplete, onTokenError, onUseAlbumError]);

  // Detect new sessions
  useEffect(() => {
    if (!latestSessionData || !sessionPollingEnabled) return;

    const currentSessionId = latestSessionData.id;

    console.log("[Session Polling] Current session ID:", currentSessionId, "Last known:", lastKnownSessionIdRef.current);

    // Initialize the last known session ID on first poll
    if (lastKnownSessionIdRef.current === null) {
      console.log("[Session Polling] Initializing with session ID:", currentSessionId);
      lastKnownSessionIdRef.current = currentSessionId;
      return;
    }

    // Check if a new session was created
    if (currentSessionId !== lastKnownSessionIdRef.current) {
      console.log("[Session Polling] NEW SESSION DETECTED! Old:", lastKnownSessionIdRef.current, "New:", currentSessionId);
      lastKnownSessionIdRef.current = currentSessionId;

      // Show success toast
      toast.success("Token submitted successfully");
      console.log("Token submitted successfully, on " + sessionPollingRegion + " region");

      // Stop session polling
      setSessionPollingEnabled(false);

      // Start full fetch status polling for the new session
      if (sessionPollingRegion) {
        const session: FetchSession = {
          id: currentSessionId,
          status: "pending",
          startedAt: new Date(latestSessionData.startedAt),
        };
        setCurrentSession(session);
        setLastFetchTime(new Date());
        setFetchError(null);

        // Start polling for the new session
        pollFetchStatus(currentSessionId, sessionPollingRegion);
      }

      // Call the callback if provided
      if (onSessionDetectedRef.current) {
        onSessionDetectedRef.current();
      }
    }
  }, [latestSessionData, sessionPollingEnabled, sessionPollingRegion, pollFetchStatus]);

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

      // Start polling immediately with the returned session ID
      pollFetchStatus(data.sessionId, variables.region);
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

    // Let the mutation error bubble up to the caller
    await startFetchMutation.mutateAsync({ region, token });
  };

  // Start automatic fetch using saved token
  const startAutomaticFetch = async (region: Region): Promise<void> => {
    return startDataFetch(region); // No token provided, will use saved token
  };


  useEffect(() => () => {
    fetchPollingGenerationRef.current++;
    if (fetchPollingTimeoutRef.current !== null) {
      window.clearTimeout(fetchPollingTimeoutRef.current);
      fetchPollingTimeoutRef.current = null;
    }
  }, []);

  const resetFetchSession = useCallback(() => {
    fetchPollingGenerationRef.current++;
    if (fetchPollingTimeoutRef.current !== null) {
      window.clearTimeout(fetchPollingTimeoutRef.current);
      fetchPollingTimeoutRef.current = null;
    }
    setCurrentSession(null);
    setFetchError(null);
  }, []);

  // Start polling for new sessions
  const startSessionPolling = useCallback((region: Region, onSessionDetected?: () => void) => {
    console.log("[startSessionPolling] Starting session polling for region:", region);
    setSessionPollingRegion(region);
    setSessionPollingEnabled(true);
    lastKnownSessionIdRef.current = null; // Reset to detect the first session
    onSessionDetectedRef.current = onSessionDetected;
  }, []);

  // Stop polling for new sessions
  const stopSessionPolling = useCallback(() => {
    console.log("[stopSessionPolling] Stopping session polling");
    setSessionPollingEnabled(false);
    setSessionPollingRegion(null);
    lastKnownSessionIdRef.current = null;
    onSessionDetectedRef.current = undefined;
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
    isPollingForSession: sessionPollingEnabled,
    fetchToastState,
  };
}
