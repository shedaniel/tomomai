"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@tomomai/ui";

/** What a settings form tells the guard about its unsaved changes. */
export type UnsavedChanges = {
  dirty: boolean;
  /** Resolves true once everything saved. */
  save: () => Promise<boolean>;
  discard: () => void;
};

type UnsavedChangesContextValue = {
  register: (changes: UnsavedChanges | null) => void;
  /** Runs `leave` now, or once the user saves or discards their changes. */
  attemptLeave: (leave: () => void) => void;
  /** Increments each time a leave is held back, so the save bar can shake. */
  nudge: number;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

/** Leaves through `leave` unless unsaved settings hold it back. Outside the settings layout it leaves at once. */
export function useGuardedLeave() {
  const ctx = useUnsavedChanges();
  return useCallback((leave: () => void) => (ctx ? ctx.attemptLeave(leave) : leave()), [ctx]);
}

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Holds back leaving a settings page with unsaved changes: in-app links and guarded navigation
 * shake the save bar and ask first, and closing or reloading the tab asks through the browser.
 * The browser's back and forward buttons cannot be held back.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("settings.unsaved");
  const router = useRouter();
  const changes = useRef<UnsavedChanges | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [nudge, setNudge] = useState(0);
  const [saving, setSaving] = useState(false);

  const register = useCallback((next: UnsavedChanges | null) => {
    changes.current = next;
  }, []);

  const attemptLeave = useCallback((leave: () => void) => {
    if (!changes.current?.dirty) {
      leave();
      return;
    }
    setNudge((n) => n + 1);
    setPendingLeave(() => leave);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!changes.current?.dirty || event.defaultPrevented || isModifiedClick(event)) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      // Leaving the site goes through beforeunload instead.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      attemptLeave(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!changes.current?.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [attemptLeave, router]);

  const leaveNow = () => {
    const leave = pendingLeave;
    setPendingLeave(null);
    leave?.();
  };

  const discardAndLeave = () => {
    changes.current?.discard();
    leaveNow();
  };

  const saveAndLeave = async () => {
    if (!changes.current) return leaveNow();
    setSaving(true);
    try {
      if (await changes.current.save()) leaveNow();
    } finally {
      setSaving(false);
    }
  };

  const value = useMemo(() => ({ register, attemptLeave, nudge }), [register, attemptLeave, nudge]);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <AlertDialog open={pendingLeave !== null} onOpenChange={(open) => !open && !saving && setPendingLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("keepEditing")}</AlertDialogCancel>
            <Button variant="outline" onClick={discardAndLeave} disabled={saving}>{t("discard")}</Button>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void saveAndLeave();
              }}
            >
              {saving ? t("saving") : t("saveAndLeave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedChangesContext.Provider>
  );
}
