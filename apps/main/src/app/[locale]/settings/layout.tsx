import { getServerSession } from "@/lib/auth-server";
import { SettingsSidebar } from "@/components/settings/sidebar";
import { Link, redirect } from "@/i18n/navigation"
import { BrandLogo } from "@/components/brand-logo";
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
          <BrandLogo section="dashboard" height={44} priority />
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
