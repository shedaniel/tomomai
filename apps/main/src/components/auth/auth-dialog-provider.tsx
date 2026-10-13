"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { AuthDialog, type AuthDialogMode } from "@/components/auth/auth-dialog";
import { AuthErrorHandler } from "@/components/auth/auth-error-handler";
import { stripAuthErrorParams } from "@/lib/auth-errors";
import { getStrictContext } from "@/lib/get-strict-context";

export interface OpenAuthDialogOptions {
  mode?: AuthDialogMode;
  error?: string;
  /** Where to land after signing in. Defaults to the current page. */
  callbackURL?: string;
}

interface AuthDialogContextValue {
  openAuthDialog: (options?: OpenAuthDialogOptions) => void;
}

const [AuthDialogContextProvider, useAuthDialog] = getStrictContext<AuthDialogContextValue>("AuthDialogProvider");

export { useAuthDialog };

function currentPageURL() {
  const params = stripAuthErrorParams(new URLSearchParams(window.location.search));
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthDialogMode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [callbackURL, setCallbackURL] = useState("/");

  const openAuthDialog = useCallback((options: OpenAuthDialogOptions = {}) => {
    setMode(options.mode ?? "signin");
    setError(options.error ?? null);
    setCallbackURL(options.callbackURL ?? currentPageURL());
    setMounted(true);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openAuthDialog }), [openAuthDialog]);

  return (
    <AuthDialogContextProvider value={value}>
      {children}
      <Suspense fallback={null}>
        <AuthErrorHandler openAuthDialog={openAuthDialog} />
      </Suspense>
      {mounted && (
        <AuthDialog
          open={open}
          onOpenChange={setOpen}
          mode={mode}
          onModeChange={setMode}
          error={error}
          onErrorChange={setError}
          callbackURL={callbackURL}
        />
      )}
    </AuthDialogContextProvider>
  );
}
