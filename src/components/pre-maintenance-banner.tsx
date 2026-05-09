"use client";

import { useState, useEffect } from 'react';
import { TriangleAlert, X } from 'lucide-react';

const STORAGE_KEY = 'dismissed-pre-maintenance';

interface Props {
  title: string;
  description: string;
  raw: string;
}

export function PreMaintenanceBanner({ title, description, raw }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== raw) {
      setVisible(true);
    }
  }, [raw]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, raw);
    setVisible(false);
  }

  return (
    <div className="sticky top-0 z-50 w-full border-b border-border bg-muted/60 backdrop-blur-sm p-4">
      <div className="max-w-screen-xl mx-auto flex gap-3 items-start">
        <div className="mt-0.5 shrink-0 rounded-full bg-primary/15 p-1">
          <TriangleAlert className="h-3 w-3 text-primary" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="text-sm text-muted-foreground">
            {description.split(/\\n\\n|\n\n/).map((para, pi) => (
              <span key={pi} className={`block${pi > 0 ? ' mt-[0.5em]' : ''}`}>
                {para.split(/\\n|\n/).map((line, li, lines) => (
                  <span key={li}>
                    {line}
                    {li < lines.length - 1 && <br />}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground bg-accent hover:bg-accent/70 transition-colors cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
