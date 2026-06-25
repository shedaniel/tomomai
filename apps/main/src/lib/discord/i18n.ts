import enUS from '../../../messages/discord/en-US.json';
import enGB from '../../../messages/discord/en-GB.json';
import ja from '../../../messages/discord/ja.json';
import zhCN from '../../../messages/discord/zh-CN.json';
import zhTW from '../../../messages/discord/zh-TW.json';
import ko from '../../../messages/discord/ko.json';
import { getLogger } from '@/lib/request-logger';

export type DiscordLocale = 'en-US' | 'en-GB' | 'ja' | 'zh-CN' | 'zh-TW' | 'ko';

const SUPPORTED_DISCORD_LOCALES = new Set<string>([
  'en-US', 'en-GB', 'ja', 'zh-CN', 'zh-TW', 'ko',
]);

const MESSAGES: Record<string, unknown> = {
  'en-US': enUS,
  'en-GB': enGB,
  'ja': ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ko': ko,
};

export const DEFAULT_DISCORD_LOCALE: DiscordLocale = 'en-US';

const warnedKeys = new Set<string>();

export function resolveDiscordLocale(locale: string | undefined): DiscordLocale {
  if (locale && SUPPORTED_DISCORD_LOCALES.has(locale)) return locale as DiscordLocale;
  return DEFAULT_DISCORD_LOCALE;
}

function lookup(obj: unknown, segments: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`,
  );
}

export function t(
  locale: string | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const resolved = resolveDiscordLocale(locale);
  const messages = MESSAGES[resolved] ?? MESSAGES[DEFAULT_DISCORD_LOCALE];
  const value = lookup(messages, key.split('.'));

  if (typeof value === 'string') return interpolate(value, params);

  // Fall back to en-US, then to the key itself.
  const fallback = lookup(MESSAGES[DEFAULT_DISCORD_LOCALE], key.split('.'));
  if (typeof fallback === 'string') return interpolate(fallback, params);

  if (!warnedKeys.has(key)) {
    warnedKeys.add(key);
    getLogger().warn({ key, locale: resolved }, 'Missing Discord i18n key');
  }
  return key;
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function getDiscordTranslator(locale: string | undefined): Translator {
  return (key, params) => t(locale, key, params);
}
