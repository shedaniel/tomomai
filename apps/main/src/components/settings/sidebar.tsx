"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button, Sidebar, SidebarItem } from "@tomomai/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { User, Download, Lock, Code, ArrowLeft, AppWindow } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Flags } from "@/lib/flags";
import { useGuardedLeave } from "@/components/settings/primitives";

export function SettingsSidebar({ flags }: { flags: Flags }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const leave = useGuardedLeave();

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

  const current = navItems.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  const go = (href: string) => {
    if (href !== pathname) leave(() => router.push(href));
  };

  return (
    <>
      {/* Phones get one row: back, and the current section as a menu of the others. */}
      <div className="flex items-center gap-2 sm:hidden">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href="/" aria-label={t("common.back")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Select value={current?.href ?? ""} onValueChange={go}>
          <SelectTrigger className="flex-1 bg-background" aria-label={t("common.settings")}>
            <SelectValue>
              {current && (
                <span className="flex items-center gap-2">
                  <current.icon className="h-4 w-4 text-muted-foreground" />
                  {t(`settings.pages.${current.key}.title`)}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent label={t("common.settings")}>
            {navItems.map(({ key, href, icon: Icon }) => (
              <SelectItem key={href} value={href}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {t(`settings.pages.${key}.title`)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="max-sm:hidden">
        <Sidebar value={pathname} onValueChange={go}>
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50 sm:mb-2 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("common.back")}</span>
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
      </div>
    </>
  );
}
