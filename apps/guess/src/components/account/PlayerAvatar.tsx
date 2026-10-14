"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@tomomai/ui/utils";

type Props = {
  /** tomomai profile picture; falls back to the name's initial. */
  image?: string | null;
  /** Null renders the guest silhouette. */
  name: string | null;
  className?: string;
};

export function PlayerAvatar({ image, name, className }: Props) {
  const [broken, setBroken] = useState(false);
  const base = cn(
    "inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground",
    className,
  );

  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        aria-hidden
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cn(base, "object-cover")}
      />
    );
  }
  return (
    <span aria-hidden className={base}>
      {name ? name[0]!.toUpperCase() : <UserRound className="size-[55%]" strokeWidth={2.25} />}
    </span>
  );
}
