import type { ReactNode } from 'react';
import './globals.css';
import './cjk-fonts.css';
import './vaul.css';

/** Pass-through; <html>/<body> live in [locale]/layout.tsx. Keep request-data-free. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
