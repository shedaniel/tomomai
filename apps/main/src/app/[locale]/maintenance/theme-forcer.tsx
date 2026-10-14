'use client';

import { useEffect } from 'react';
import { getThemeOrDefault, applyTheme } from '@/lib/themes';
import { useGame } from '@/components/providers/game-provider';

export function MaintenanceThemeForcer() {
  const defaultTheme = useGame().brand.theme;
  useEffect(() => {
    applyTheme(getThemeOrDefault(null, defaultTheme));
  }, [defaultTheme]);

  return null;
}
