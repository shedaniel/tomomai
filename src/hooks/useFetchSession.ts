import { useState, useEffect, useRef, useCallback } from "react";
import { trpc, trpcClient } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Region, FetchSession } from "@/lib/types";
import { Flags } from "@/lib/flags";

export function useFetchSession(onFetchComplete?: () => void, flags?: Flags) {
  const [currentSession, setCurrentSession] = useState<FetchSession | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  
  // Session polling state
  const [sessionPollingEnabled, setSessionPollingEnabled] = useState(false);
  const [sessionPollingRegion, setSessionPollingRegion] = useState<Region | null>(null);
  const lastKnownSessionIdRef = useRef<string | null>(null);
  const onSessionDetectedRef = useRef<(() => void) | undefined>(undefined);

  // Poll for new fetch sessions (lightweight query)
  const { data: latestSessionData } = trpc.user.getLatestFetchSessionId.useQuery(
    { region: sessionPollingRegion! },
    {
      enabled: sessionPollingEnabled && sessionPollingRegion !== null,
      refetchInterval: 1000, // Poll every 1 seconds
      refetchOnWindowFocus: false,
    }
  );

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
  }, [latestSessionData, sessionPollingEnabled, sessionPollingRegion]);

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
      setFetchError(error.message);
      // Don't set error here - let it bubble up to be caught by the calling component
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

  const pollFetchStatus = async (sessionId: string, region: Region) => {
    const maxAttempts = 600; // 5 minutes max (300 seconds / 0.5 second = 600 attempts)
    let attempts = 0;

    const poll = async () => {
      try {
        // Query the latest fetch status directly using tRPC client
        const result = await trpcClient.user.getFetchStatus.query({
          region,
        });
        
        if (result && result.id === sessionId) {
          // Only update if this is the session we're tracking
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
            if (result.notFoundScores && result.notFoundScores.length > 0) {
              toast.error(`Data fetch completed with ${result.notFoundScores.length} songs not found in database! ${result.notFoundScores.map(score => `- ${score.songName} (${score.difficulty}, ${score.musicType})`).join(", ")}`);
            } else {
              toast.success("Data fetch completed successfully!");
            }
            onFetchComplete?.();
            return "completed";
          } else if (result.status === "failed") {
            const errorMessage = result.errorMessage || "Fetch failed";
            setFetchError(errorMessage);
            toast.error(`Data fetch failed: ${errorMessage}`);
            return "failed";
          }
        } else if (!result) {
          // No fetch sessions found at all
          setFetchError("Fetch session not found");
          return "error";
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 500); // Poll every 0.5 second
        } else {
          setFetchError("Fetch timeout");
          return "timeout";
        }
      } catch (error) {
        console.error("Error polling fetch status:", error);
        setFetchError("Failed to check fetch status");
        return "error";
      }
    };

    return poll();
  };

  const resetFetchSession = useCallback(() => {
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
  };
} 