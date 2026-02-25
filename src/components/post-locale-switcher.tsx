"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Locale } from "@/i18n/locale";

interface PostLocaleSwitcherProps {
  availableLocales: string[];
  currentLocale: string;
}

const localeNames: Record<string, string> = {
  'en': 'English',
  'en-GB': 'English (UK)',
  'ja': '日本語',
  'zh-TW': '繁體中文 (台灣)',
  'zh-HK': '繁體中文 (香港)',
  'zh-CN': '简体中文',
  'ko': '한국어',
  'yue': '廣東話',
};

export function PostLocaleSwitcher({ availableLocales, currentLocale }: PostLocaleSwitcherProps) {
  const { setLocale } = useLocale();

  if (availableLocales.length <= 1) {
    return null; // Don't show if only one language available
  }

  return (
    <Select
      value={currentLocale}
      onValueChange={(value) => setLocale(value as Locale)}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableLocales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeNames[locale] || locale}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
