import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@tomomai/i18n/client";

type Props = {
  /** Rendered under the LocaleSwitcher (e.g. HostLabel on the game page). */
  belowLocale?: ReactNode;
};

/**
 * Shared site chrome (logo + locale switcher) used by `GamePage` and the
 * 404 page. Keeps top-of-page layout consistent across surfaces.
 */
export function SiteHeader({ belowLocale }: Props) {
  return (
    <div className="flex justify-between pt-8 pb-4 items-start shrink-0">
      <Link href="https://www.tomomai.lol" className="block w-fit">
        <Image
          src="/icon.webp"
          alt="tomomai"
          width={4320}
          height={1080}
          className="h-10 w-auto dark:hidden"
          style={{ aspectRatio: "4320 / 1080" }}
          priority
        />
        <Image
          src="/icon-dark.webp"
          alt="tomomai"
          width={4320}
          height={1080}
          className="h-10 w-auto hidden dark:block"
          style={{ aspectRatio: "4320 / 1080" }}
          priority
        />
      </Link>
      <div className="flex flex-col items-end gap-1">
        <LocaleSwitcher forceVisible />
        {belowLocale}
      </div>
    </div>
  );
}
