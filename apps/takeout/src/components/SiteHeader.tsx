import Image from "next/image";
import Link from "next/link";
import { LocaleSwitcher } from "@tomomai/i18n/client";
import { Button } from "@tomomai/ui";

type Props = {
  authenticated: boolean;
  onSignOut?: () => void;
};

export function SiteHeader({ authenticated, onSignOut }: Props) {
  return (
    <div className="flex justify-between pt-8 pb-4 items-start shrink-0 gap-4">
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
      <div className="flex flex-col items-end gap-2">
        <LocaleSwitcher forceVisible />
        {authenticated ? (
          <Button type="button" variant="outline" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        ) : (
          <Button asChild size="sm">
            <a href="/api/auth/start">Sign in</a>
          </Button>
        )}
      </div>
    </div>
  );
}
