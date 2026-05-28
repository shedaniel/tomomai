"use client";

import Link from "next/link";
import { Button } from "@tomomai/ui";

type Props = {
  label: string;
};

/**
 * Client wrapper for the 404 CTA. `@tomomai/ui`'s Button auto-wraps its
 * onClick for haptics, which breaks if rendered from a server component.
 */
export function NotFoundCta({ label }: Props) {
  return (
    <Link href="/">
      <Button size="lg">{label}</Button>
    </Link>
  );
}
