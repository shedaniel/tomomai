"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
  getLocaleCookie,
  setLocaleCookie,
} from "./locale";

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

  useEffect(() => {
    if (forcedLocale) return;
    const cookieLocale = getLocaleCookie();
    if (cookieLocale && cookieLocale !== locale) {
      setLocaleState(cookieLocale);
    }
  }, [locale, forcedLocale]);

  const setLocale = (newLocale: Locale) => {
    if (forcedLocale) return;
    setLocaleState(newLocale);
    setLocaleCookie(newLocale);
    router.refresh();
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

  const handleNewLocale = (value: string) => {
    const newLocale = value === "auto" ? null : (value as Locale);
    if (newLocale) {
      setLocale(newLocale);
      setLocaleCookie(newLocale);
    } else {
      if (typeof document !== "undefined") {
        document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
      }
      window.location.reload();
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
