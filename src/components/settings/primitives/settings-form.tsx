"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type SaveHandler = () => Promise<void> | void;
type ResetHandler = () => void;

type SettingsFormContextValue = {
  isLoading: boolean;
  isDirty: boolean;
  registerDirty: (key: string, dirty: boolean) => void;
  registerSave: (key: string, fn: SaveHandler) => void;
  registerReset: (key: string, fn: ResetHandler) => void;
  unregister: (key: string) => void;
  runSave: () => Promise<void>;
  runReset: () => void;
};

const SettingsFormContext = createContext<SettingsFormContextValue | null>(null);

export function useSettingsForm() {
  const ctx = useContext(SettingsFormContext);
  if (!ctx) throw new Error("useSettingsForm must be used within <SettingsForm>");
  return ctx;
}

export function SettingsForm({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [dirtyFlags, setDirtyFlags] = useState<Record<string, boolean>>({});
  const saveHandlers = useRef<Map<string, SaveHandler>>(new Map());
  const resetHandlers = useRef<Map<string, ResetHandler>>(new Map());

  const registerDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyFlags((prev) => {
      if (prev[key] === dirty) return prev;
      const next = { ...prev };
      if (dirty) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const registerSave = useCallback((key: string, fn: SaveHandler) => {
    saveHandlers.current.set(key, fn);
  }, []);

  const registerReset = useCallback((key: string, fn: ResetHandler) => {
    resetHandlers.current.set(key, fn);
  }, []);

  const unregister = useCallback((key: string) => {
    saveHandlers.current.delete(key);
    resetHandlers.current.delete(key);
    setDirtyFlags((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const runSave = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all(Array.from(saveHandlers.current.values()).map((fn) => fn()));
      toast.success(t("settings.saved"));
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error(t("settings.errorSaving"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const runReset = useCallback(() => {
    resetHandlers.current.forEach((fn) => fn());
  }, []);

  const isDirty = Object.keys(dirtyFlags).length > 0;

  const value = useMemo<SettingsFormContextValue>(
    () => ({ isLoading, isDirty, registerDirty, registerSave, registerReset, unregister, runSave, runReset }),
    [isLoading, isDirty, registerDirty, registerSave, registerReset, unregister, runSave, runReset],
  );

  return <SettingsFormContext.Provider value={value}>{children}</SettingsFormContext.Provider>;
}

export function useDirtyFlag(key: string, dirty: boolean) {
  const { registerDirty, unregister } = useSettingsForm();
  useEffect(() => {
    registerDirty(key, dirty);
  }, [key, dirty, registerDirty]);
  useEffect(() => {
    return () => unregister(key);
  }, [key, unregister]);
}

export function useSettingsSave(key: string, fn: SaveHandler) {
  const { registerSave } = useSettingsForm();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    registerSave(key, () => ref.current());
  }, [key, registerSave]);
}

export function useSettingsReset(key: string, fn: ResetHandler) {
  const { registerReset } = useSettingsForm();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    registerReset(key, () => ref.current());
  }, [key, registerReset]);
}
