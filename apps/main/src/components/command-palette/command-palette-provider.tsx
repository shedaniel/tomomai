"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PaletteItem } from "./types";
import { CommandPalette } from "./command-palette";

type ContextualActions = Record<string, readonly PaletteItem[]>;

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  contextualActions: readonly PaletteItem[];
  registerActions: (owner: string, actions: readonly PaletteItem[] | null) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Holds the command palette and opens it with ⌘K / Ctrl+K anywhere, or / outside a text field. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState<ContextualActions>({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        setOpen(current => !current);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const registerActions = useCallback((owner: string, next: readonly PaletteItem[] | null) => {
    setActions(current => {
      const updated = { ...current };
      if (next) updated[owner] = next;
      else delete updated[owner];
      return updated;
    });
  }, []);

  const value = useMemo<CommandPaletteContextValue>(() => ({
    open,
    setOpen,
    contextualActions: Object.values(actions).flat(),
    registerActions,
  }), [open, actions, registerActions]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return context;
}

/** Offers the page's own actions, such as the dashboard's Fetch, in the palette while the page is mounted. */
export function useCommandPaletteActions(owner: string, actions: readonly PaletteItem[]) {
  const { registerActions } = useCommandPalette();
  useEffect(() => {
    registerActions(owner, actions);
    return () => registerActions(owner, null);
  }, [owner, actions, registerActions]);
}
