"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";

import { Locale, setLocaleCookie } from "@/i18n/locale";
import { cn, getLanguages } from "@/lib/utils";
import { useLocale } from "./providers/locale-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select-friendly";

interface LocaleSwitcherProps {
  forceVisible?: boolean;
}

export function LocaleSwitcher({ forceVisible }: LocaleSwitcherProps  ) {
  const t = useTranslations();
  const LANGUAGES = getLanguages(t);
  const { locale, setLocale } = useLocale();

  const handleNewLocale = (newLocale: Locale | null) => {
    if (newLocale) {
      setLocale(newLocale);
      setLocaleCookie(newLocale);
    } else {
      // Clear cookie to use auto-detection
      if (typeof document !== 'undefined') {
        document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
      }
      // Reload to detect language from browser
      window.location.reload();
    }
  };

  return (
    <Select value={locale} onValueChange={handleNewLocale}>
      <SelectTrigger variant="secondary" size="sm" className="bg-background">
        <SelectValue>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            <span className={cn("whitespace-nowrap", !forceVisible && "max-sm:hidden")}>{t('common.language')}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((language) => (
          <SelectItem key={language.value || "auto"} value={language.value || "auto"}>
            <div className="flex items-center justify-between gap-2">
              <Languages className="h-4 w-4" />
              {language.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 