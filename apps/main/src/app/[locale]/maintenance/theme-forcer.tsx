'use client';

import { useEffect } from 'react';
import { getThemeOrDefault, applyTheme } from '@/lib/themes';

export function MaintenanceThemeForcer() {
  useEffect(() => {
    const theme = getThemeOrDefault('gray-pink');
    applyTheme(theme);
  }, []);

  return null;
}
