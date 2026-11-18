import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import type { ScriptGame } from "./games";
import { LOCALES, MESSAGES, format, matchLocale, panelMessages, type ErrorKey, type Locale, type Messages } from "./i18n";

const KEY_CHOSEN = "locale";
const KEY_SITE = "siteLocale";

function stored(key: string): Locale | null {
  const value = GM_getValue(key, null) as string | null;
  return value && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : null;
}

/** The player's own pick in the panel, then the language they use tomomai in, then the browser's. */
export function currentLocale(): Locale {
  return stored(KEY_CHOSEN)
    ?? stored(KEY_SITE)
    ?? navigator.languages.map(matchLocale).find(locale => locale !== null)
    ?? "en";
}

export function chooseLocale(locale: Locale): void {
  GM_setValue(KEY_CHOSEN, locale);
}

export function rememberSiteLocale(tag: string): void {
  const locale = matchLocale(tag);
  if (locale) GM_setValue(KEY_SITE, locale);
}

export function messages(game: ScriptGame, host: ScriptGame): Messages {
  return panelMessages(currentLocale(), game, host.product);
}

/** An error the panel shows in the player's language. Its message is the English text, for logs. */
export class ScriptError extends Error {
  constructor(readonly key: ErrorKey, readonly vars: Record<string, string | number> = {}) {
    super(format(MESSAGES.en.errors[key], vars));
  }

  localized(t: Messages): string {
    return format(t.errors[this.key], this.vars);
  }
}
