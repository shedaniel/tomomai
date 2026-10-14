"use client";

import { initializeTheme } from "@/lib/themes";
import { useGame } from "@/components/providers/game-provider";
import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const defaultTheme = useGame().brand.theme;
  useEffect(() => {
    initializeTheme(defaultTheme);
  }, [defaultTheme]);

  return <>{children}</>;
}
