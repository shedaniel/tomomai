"use client";

import { useEffect, useState } from "react";
import { isAprilFools2026JST } from "@/lib/april-fools";

export function AprilFools() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (isAprilFools2026JST()) {
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
  }, []);

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
