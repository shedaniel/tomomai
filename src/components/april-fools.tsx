"use client";

import { useEffect, useState } from "react";

export function AprilFools({ enabled }: { enabled: boolean }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (enabled) {
      import("@fontsource/comic-neue/300.css");
      import("@fontsource/comic-neue/400.css");
      import("@fontsource/comic-neue/700.css");
      import("@fontsource/zen-maru-gothic/300.css");
      import("@fontsource/zen-maru-gothic/400.css");
      import("@fontsource/zen-maru-gothic/500.css");
      import("@fontsource/zen-maru-gothic/700.css");
      import("@fontsource/zen-maru-gothic/900.css");
      setActive(true);
    }
  }, [enabled]);

  if (!active) return null;

  return (
    <style>{`
      body, .uppercase {
        font-family: 'Comic Neue', 'Zen Maru Gothic', cursive !important;
        text-transform: lowercase !important;
      }
    `}</style>
  );
}
