"use client";

import { useEffect, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';

const STORAGE_KEY = 'dismissed-pre-maintenance';

interface Banner {
  title: string;
  description: string;
  raw: string;
}

function isBanner(value: unknown): value is Banner {
  if (typeof value !== 'object' || value === null) return false;

  const banner = value as Record<string, unknown>;
  return (
    typeof banner.title === 'string' &&
    typeof banner.description === 'string' &&
    typeof banner.raw === 'string'
  );
}

export function PreMaintenanceBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBanner() {
      try {
        const response = await fetch('/api/pre-maintenance', {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const payload: unknown = await response.json();
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('banner' in payload) ||
          !isBanner(payload.banner)
        ) {
          return;
        }

        if (localStorage.getItem(STORAGE_KEY) !== payload.banner.raw) {
          setBanner(payload.banner);
        }
      } catch {
        // Fetch and response errors intentionally leave the banner hidden.
      }
    }

    void loadBanner();

    return () => controller.abort();
  }, []);

  if (!banner) return null;

  const { title, description, raw } = banner;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, raw);
    setBanner(null);
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
