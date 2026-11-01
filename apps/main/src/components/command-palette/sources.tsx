"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart, BookOpen, Clock, Code, Database, Download, Heart, Home, Image as ImageIcon, KeyRound, Languages,
  LayoutGrid, Lock, LogIn, LogOut, Music, Palette, User, AppWindow,
} from "lucide-react";
import { useLocale } from "@tomomai/i18n/client";
import { getLanguages } from "@tomomai/i18n/languages";
import type { Locale } from "@tomomai/i18n/locale";
import { useGame } from "@/components/providers/game-provider";
import { useAuthDialog } from "@/components/auth/auth-dialog-provider";
import { isGameCnExclusive, isPlayerAvailable, navCatalogSections, supportsGameFeature } from "@/lib/games/frontend";
import type { GameCapability } from "@/lib/games/types";
import { signOut, useSession } from "@/lib/auth-client";
import type { PaletteItem } from "./types";

const DASHBOARD_TABS: { id: string; labelKey: string; capability: GameCapability; icon: PaletteItem["icon"] }[] = [
  { id: "info", labelKey: "dataContent.tabs.playerInfo", capability: "scores", icon: User },
  { id: "songs", labelKey: "dataContent.tabs.songs", capability: "scores", icon: Music },
  { id: "recent", labelKey: "dataContent.tabs.recentPlays", capability: "recents", icon: Clock },
  { id: "recommendations", labelKey: "dataContent.tabs.recommendations", capability: "scores", icon: Heart },
  { id: "stats", labelKey: "dataContent.tabs.stats", capability: "stats", icon: BarChart },
  { id: "exportImage", labelKey: "dataContent.tabs.exportImage", capability: "image-export", icon: ImageIcon },
];

const SECTION_ICONS: Record<string, PaletteItem["icon"]> = {
  songs: Music,
  stats: BarChart,
  events: LayoutGrid,
  posts: BookOpen,
  calculator: Database,
};

const SETTINGS_PAGES: { key: "account" | "privacy" | "fetch" | "applications" | "developer"; icon: PaletteItem["icon"]; capability?: GameCapability }[] = [
  { key: "account", icon: User },
  { key: "privacy", icon: Lock },
  { key: "fetch", icon: Download, capability: "scores" },
  { key: "applications", icon: AppWindow },
  { key: "developer", icon: Code },
];

/** Every page the palette can open, in the served game and for the signed-in state. */
export function usePageItems(): PaletteItem[] {
  const t = useTranslations();
  const game = useGame();
  const { data: session } = useSession();
  const signedIn = !!session?.user;

  return useMemo(() => {
    const items: PaletteItem[] = [
      { id: "page:home", group: "pages", title: t("header.tabs.dashboard"), icon: Home, href: "/", keywords: ["home", "top"], remember: true },
      { id: "page:db", group: "pages", title: t("header.tabs.db"), icon: Database, href: "/db", keywords: ["database", "catalog"], remember: true },
    ];
    for (const section of navCatalogSections(game)) {
      items.push({
        id: `page:db:${section}`,
        group: "pages",
        title: t(`db.types.${section}`),
        subtitle: t("header.tabs.db"),
        icon: SECTION_ICONS[section] ?? Database,
        href: `/db/${section}`,
        remember: true,
      });
    }
    if (signedIn && isPlayerAvailable(game)) {
      for (const tab of DASHBOARD_TABS) {
        if (!supportsGameFeature(game, tab.capability)) continue;
        items.push({
          id: `page:tab:${tab.id}`,
          group: "pages",
          title: t(tab.labelKey),
          subtitle: t("header.tabs.dashboard"),
          icon: tab.icon,
          href: `/?tab=${tab.id}`,
          remember: true,
        });
      }
    }
    if (signedIn) {
      for (const page of SETTINGS_PAGES) {
        if (page.capability && !supportsGameFeature(game, page.capability)) continue;
        items.push({
          id: `page:settings:${page.key}`,
          group: "pages",
          title: t(`settings.pages.${page.key}.title`),
          subtitle: t("common.settings"),
          icon: page.icon,
          href: `/settings/${page.key}`,
          keywords: ["settings", "preferences"],
          remember: true,
        });
      }
    }
    items.push({
      id: "page:developer",
      group: "pages",
      title: t("settings.pages.developer.portalTitle"),
      subtitle: t("settings.pages.developer.portalDescription"),
      icon: Code,
      href: "/developer",
      keywords: ["api", "docs", "reference"],
      remember: true,
    });
    return items;
  }, [t, game, signedIn]);
}

/** What the palette can do anywhere: switch language or theme, sign in or out, update the token. */
export function useActionItems({ openTheme }: { openTheme: () => void }): PaletteItem[] {
  const t = useTranslations();
  const game = useGame();
  const { locale, setLocale } = useLocale();
  const { data: session } = useSession();
  const { openAuthDialog } = useAuthDialog();
  const signedIn = !!session?.user;

  return useMemo(() => {
    const items: PaletteItem[] = [];
    if (!signedIn) {
      items.push({ id: "action:sign-in", group: "actions", title: t("commandPalette.actions.signIn"), icon: LogIn, perform: () => openAuthDialog() });
    }
    if (signedIn && supportsGameFeature(game, "scores")) {
      items.push({
        id: "action:token",
        group: "actions",
        title: t("commandPalette.actions.updateToken"),
        icon: KeyRound,
        href: "/settings/fetch",
        keywords: ["token", "login", "fetch"],
      });
    }
    items.push({ id: "action:theme", group: "actions", title: t("commandPalette.actions.theme"), icon: Palette, perform: openTheme, keywords: ["theme", "colour", "color", "dark"] });
    // A China-only deployment pins its locale.
    const languages = isGameCnExclusive(game) ? [] : getLanguages(key => t(key));
    for (const language of languages) {
      if (language.value === null || language.value === locale) continue;
      const target: Locale = language.value;
      items.push({
        id: `action:language:${target}`,
        group: "actions",
        title: t("commandPalette.actions.language", { language: language.label }),
        icon: Languages,
        perform: () => setLocale(target),
        keywords: ["language", target, language.code],
        searchOnly: true,
      });
    }
    if (signedIn) {
      items.push({
        id: "action:sign-out",
        group: "actions",
        title: t("commandPalette.actions.signOut"),
        icon: LogOut,
        perform: () => {
          void signOut().then(() => window.location.assign("/"));
        },
      });
    }
    return items;
  }, [t, game, locale, setLocale, signedIn, openAuthDialog, openTheme]);
}
