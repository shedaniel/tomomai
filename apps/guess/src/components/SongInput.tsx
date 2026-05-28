"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@tomomai/ui";
import { cn } from "@tomomai/ui/utils";
import type { SongSummary } from "@/lib/client-types";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

/** Autocompleting song-name input. Debounces 150ms then hits /api/search. */
export function SongInput({ value, onChange, onSubmit, disabled }: Props) {
  const t = useTranslations("guess");
  const [results, setResults] = useState<SongSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(value)}&limit=8`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d: { results: SongSummary[] }) => {
          setResults(d.results ?? []);
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [value]);

  const pick = (s: SongSummary) => {
    onChange(s.songName);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) {
            if (e.key === "Enter") onSubmit();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("input.placeholder")}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-md border border-border bg-popover shadow-md max-h-64 overflow-auto">
          {results.map((s, i) => (
            <button
              key={s.songId}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                i === active && "bg-accent text-accent-foreground",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <div className="font-medium truncate">{s.songName}</div>
              <div className="text-xs text-muted-foreground truncate">
                {s.artist}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
