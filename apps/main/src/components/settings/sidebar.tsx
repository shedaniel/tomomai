"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, SidebarItem } from "@tomomai/ui";
import { User, Download, Lock, Code, ArrowLeft, AppWindow } from "lucide-react";
import { useTranslations } from "next-intl";
import { Flags } from "@/lib/flags";

export function SettingsSidebar({ flags }: { flags: Flags }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  const navItems = [
    { key: "account", href: "/settings/account", icon: User },
    { key: "fetch", href: "/settings/fetch", icon: Download },
    { key: "privacy", href: "/settings/privacy", icon: Lock },
    ...(flags.settingsApplications ? [
      { key: "applications", href: "/settings/applications", icon: AppWindow },
    ] : []),
    ...(flags.settingsDeveloper ? [
      { key: "developer", href: "/settings/developer", icon: Code },
    ] : []),
  ] as const;

  return (
    <Sidebar value={pathname} onValueChange={(href) => router.push(href)}>
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50 sm:mb-2 whitespace-nowrap shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="max-sm:hidden">{t("common.back")}</span>
      </Link>
      {navItems.map(({ key, href, icon }) => (
        <SidebarItem
          key={href}
          value={href}
          icon={icon}
          text={t(`settings.pages.${key}.title`)}
          matchPrefix
        />
      ))}
    </Sidebar>
  );
}
