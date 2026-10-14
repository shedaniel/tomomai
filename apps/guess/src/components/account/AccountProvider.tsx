"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Viewer } from "@/lib/viewer";
import { StatsDialog } from "./StatsDialog";

type AccountContext = {
  /** False when the deployment has no OAuth client or database. */
  enabled: boolean;
  viewer: Viewer | null;
  setViewer: (viewer: Viewer | null) => void;
  openStats: () => void;
  /** Re-reads the viewer, e.g. to pick up a streak that just grew. */
  refreshViewer: () => Promise<void>;
  signInHref: (returnTo?: string) => string;
};

const Ctx = createContext<AccountContext>({
  enabled: false,
  viewer: null,
  setViewer: () => {},
  openStats: () => {},
  refreshViewer: async () => {},
  signInHref: () => "/api/auth/login",
});

export function useAccount() {
  return useContext(Ctx);
}

export function AccountProvider({
  enabled,
  initialViewer,
  children,
}: {
  enabled: boolean;
  initialViewer: Viewer | null;
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState(initialViewer);
  const [statsOpen, setStatsOpen] = useState(false);
  const openStats = useCallback(() => setStatsOpen(true), []);
  const refreshViewer = useCallback(async () => {
    const res = await fetch("/api/me").catch(() => null);
    if (res?.ok) setViewer(((await res.json()) as { viewer: Viewer | null }).viewer);
  }, []);

  const value = useMemo<AccountContext>(
    () => ({
      enabled,
      viewer,
      setViewer,
      openStats,
      refreshViewer,
      signInHref: (returnTo) => {
        const target =
          returnTo ?? (typeof window !== "undefined" ? window.location.pathname : "/");
        return `/api/auth/login?returnTo=${encodeURIComponent(target)}`;
      },
    }),
    [enabled, viewer, openStats, refreshViewer],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {viewer && <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />}
    </Ctx.Provider>
  );
}
