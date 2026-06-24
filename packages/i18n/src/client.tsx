"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { cn } from "@tomomai/ui/utils";
import { getLanguages } from "./languages";
import {
  Locale,
  locales,
  setLocaleCookie,
} from "./locale";

/** Swap the locale segment at the front of a pathname. */
export function swapLocaleInPath(pathname: string, locale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && (locales as readonly string[]).includes(segments[0])) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }
  return `/${segments.join("/")}`;
}

/** Strip a leading locale segment, returning the bare path. */
export function stripLocaleFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && (locales as readonly string[]).includes(segments[0])) {
    segments.shift();
  }
  return `/${segments.join("/")}`;
}

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

interface LocaleProviderProps {
  children: React.ReactNode;
  initialLocale: Locale;
  /**
   * When set, `useLocale()` returns this locale and `setLocale` becomes a
   * no-op. Used by region-locked deployments (e.g. CN-exclusive) that pin
   * a single locale regardless of user choice.
   */
  forcedLocale?: Locale;
}

export function LocaleProvider({
  children,
  initialLocale,
  forcedLocale,
}: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(forcedLocale ?? initialLocale);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (forcedLocale) return;
    const first = pathname.split("/")[1];
    if (first && (locales as readonly string[]).includes(first) && first !== locale) {
      setLocaleState(first as Locale);
    }
  }, [pathname, locale, forcedLocale]);

  const setLocale = (newLocale: Locale) => {
    if (forcedLocale) return;
    setLocaleState(newLocale);
    setLocaleCookie(newLocale);
    const next = swapLocaleInPath(pathname || "/", newLocale);
    router.push(next);
  };

  const value = forcedLocale
    ? { locale: forcedLocale, setLocale: () => {} }
    : { locale, setLocale };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextType {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}

interface LocaleSwitcherProps {
  forceVisible?: boolean;
}

export function LocaleSwitcher({ forceVisible }: LocaleSwitcherProps) {
  const t = useTranslations();
  const LANGUAGES = getLanguages(t);
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();

  const handleNewLocale = (value: string) => {
    const newLocale = value === "auto" ? null : (value as Locale);
    if (newLocale) {
      setLocale(newLocale);
      setLocaleCookie(newLocale);
    } else {
      if (typeof document !== "undefined") {
        document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
        const bare = stripLocaleFromPath(pathname || "/");
        window.location.href = bare;
      }
    }
  };

  return (
    <Select value={locale} onValueChange={handleNewLocale}>
      <SelectTrigger variant="secondary" size="sm" className="bg-background">
        <SelectValue>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            <span
              className={cn(
                "whitespace-nowrap",
                !forceVisible && "max-sm:hidden",
              )}
            >
              {t("common.language")}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGES.map((language) => (
          <SelectItem
            key={language.value || "auto"}
            value={language.value || "auto"}
          >
            <div className="flex items-center justify-between gap-2">
              <Languages className="h-4 w-4" />
              {language.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
