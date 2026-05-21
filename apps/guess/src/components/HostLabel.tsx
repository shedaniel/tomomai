"use client";

import { useEffect, useState } from "react";

type Props = {
  dateKey: string;
};

function slug(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

/**
 * Small client-side label showing `<host>/<dateSlug>` — e.g.
 * `guesser.tomomai.lol/20260521` or `localhost:3001/debug34`. The text is a
 * link to that same URL (so the share URL and on-screen label match).
 */
export function HostLabel({ dateKey }: Props) {
  const [host, setHost] = useState<string>("");

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  const path = slug(dateKey);
  const text = host ? `${host}/${path}` : " ";
  const href = host ? `${window.location.protocol}//${host}/${path}` : "#";

  return (
    <a
      href={href}
      className="text-2xs text-muted-foreground/70 tabular-nums no-underline hover:text-muted-foreground transition-colors"
    >
      {text}
    </a>
  );
}
