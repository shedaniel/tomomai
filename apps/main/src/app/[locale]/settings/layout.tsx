import { getServerSession } from "@/lib/auth-server";
import { SettingsSidebar } from "@/components/settings/sidebar";
import { Link, redirect } from "@/i18n/navigation"
import Image from "next/image";
import { useFlags } from "@/lib/flags";
import { headers } from "next/headers";

function stripLocale(path: string, locale: string): string {
  return path === `/${locale}` || path.startsWith(`/${locale}/`) || path.startsWith(`/${locale}?`) ? path.slice(locale.length + 1) || "/" : path;
}

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession();

  if (!session) {
    // Open sign-in on the landing page and come back to the settings page that was asked for.
    const requested = stripLocale((await headers()).get("x-pathname") ?? "", locale);
    const signin = requested.startsWith("/settings") ? requested : "/settings";
    redirect({ href: { pathname: "/", query: { signin } }, locale });
  }

  const flags = await useFlags();

  return (
    <div className="container mx-auto max-w-200 px-4 py-8 overflow-x-hidden">
      <div className="mb-8">
        <Link href="/">
          <Image
            src="/icon-small.webp"
            alt="tomomai"
            width={528}
            height={132}
            priority
            sizes="176px"
            className="h-11 w-auto dark:hidden"
            style={{ aspectRatio: "4 / 1" }}
          />
          <Image
            src="/icon-small-dark.webp"
            alt="tomomai"
            width={528}
            height={132}
            className="h-11 w-auto hidden dark:block"
            sizes="176px"
            style={{ aspectRatio: "4 / 1" }}
          />
        </Link>
      </div>

      <div className="flex sm:flex-row flex-col gap-8">
        <aside className="shrink-0">
          <SettingsSidebar flags={flags} />
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
