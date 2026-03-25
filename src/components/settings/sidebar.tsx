"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { User, Download, Lock, Code, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Flags } from "@/lib/flags";

export function SettingsSidebar({ flags }: { flags: Flags }) {
  const navItems = [
    { key: "account", href: "/settings/account", icon: User },
    { key: "fetch", href: "/settings/fetch", icon: Download },
    { key: "privacy", href: "/settings/privacy", icon: Lock },
    ...(flags.developerPortal ? [{ key: "developer", href: "/settings/developer", icon: Code }] : []),
  ] as const;

  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="flex sm:flex-col flex-row gap-x-1 sm:w-48 w-full shrink-0 overflow-x-auto">
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50 sm:mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="max-sm:hidden">{t("common.back")}</span>
      </Link>
      {navItems.map(({ key, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap shrink-0",
            pathname === href || pathname.startsWith(href + "/")
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Icon className="h-4 w-4" />
          {t(`settings.pages.${key}.title`)}
        </Link>
      ))}
    </nav>
  );
}
