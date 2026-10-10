export const MAX_OAUTH_APPS_PER_USER = 10;
export const MAX_API_KEYS_PER_USER = 25;

export const OAUTH_APP_LIMIT_REACHED = "OAUTH_APP_LIMIT_REACHED";
export const API_KEY_LIMIT_REACHED = "API_KEY_LIMIT_REACHED";
export const OAUTH_APP_NAME_RESERVED = "OAUTH_APP_NAME_RESERVED";

const RESERVED_NAME_TERMS = ["tomomai", "ともまい"];

/**
 * Third-party apps may not present themselves as tomomai on the consent screen. Folds width, case
 * and katakana and drops spaces and punctuation, so variants like "Tomo-Mai" and "トモマイ" match.
 */
export function isReservedAppName(name: string): boolean {
  const folded = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, "");
  return RESERVED_NAME_TERMS.some((term) => folded.includes(term));
}
