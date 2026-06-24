"use client";

import { Link } from "@/i18n/navigation"
import { Button } from "@tomomai/ui";
import type { ComponentProps } from "react";

/**
 * `Button asChild` cannot be used directly from a Server Component because
 * Button attaches an onClick (haptics) which can't cross the RSC boundary.
 * This thin client wrapper keeps the visual styling consistent.
 */
export function LinkButton({
  href,
  children,
  variant,
  size,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
