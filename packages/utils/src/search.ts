/**
 * Text search shared by every search field: the command palette, the song database, the dashboard's song
 * list and the guess apps. Matching ignores case, width, diacritics, punctuation and spacing, treats hiragana
 * and katakana as the same, and tolerates romaji written with or without long vowels.
 */

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const KANA_OFFSET = 0x60;

function foldKana(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    out += code >= HIRAGANA_START && code <= HIRAGANA_END ? String.fromCodePoint(code + KANA_OFFSET) : char;
  }
  return out;
}

/** The comparable form of a text: no case, width, diacritics, separators or kana distinction. */
export function normalizeSearchText(text: string): string {
  return foldKana(
    text
      .normalize("NFKC")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase(),
  ).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Romaji long vowels collapsed, so "toukyou", "tookyoo" and "tōkyō" compare equal. Applied after normalizing. */
export function foldRomaji(normalized: string): string {
  return normalized.replace(/([aiueo])\1+/g, "$1").replace(/ou/g, "o").replace(/ei/g, "e");
}

function words(text: string): string[] {
  return text
    .normalize("NFKC")
    .split(/[\s\p{P}\p{S}]+/u)
    .map(normalizeSearchText)
    .filter(Boolean);
}

export type SearchQueryToken = {
  /** As typed, lowercased and width-folded, for fields matched literally (levels such as `14+`). */
  raw: string;
  text: string;
  loose: string;
};

/** The tokens of a query. Every token must match some field for an item to match. */
export function parseSearchQuery(query: string): SearchQueryToken[] {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(raw => {
      const text = normalizeSearchText(raw);
      return { raw, text, loose: foldRomaji(text) };
    })
    .filter(token => token.raw.length > 0);
}

export type SearchField<T> = {
  get: (item: T) => string | readonly (string | null | undefined)[] | null | undefined;
  /** Relative importance, 1 by default. A title is usually worth more than a genre. */
  weight?: number;
  /** Compared as typed (lowercased and width-folded) by prefix, for values whose punctuation matters, such as levels. */
  literal?: boolean;
};

type IndexedValue = { text: string; loose: string; words: string[]; literal: string };
type IndexedField = { values: IndexedValue[]; weight: number; literal: boolean };

export type SearchIndex<T> = {
  readonly entries: readonly { item: T; fields: IndexedField[] }[];
};

function indexOne(value: string): IndexedValue {
  const text = normalizeSearchText(value);
  return { text, loose: foldRomaji(text), words: words(value), literal: value.normalize("NFKC").toLowerCase() };
}

/** Normalizes every field of every item once, so each query only compares strings. */
export function createSearchIndex<T>(items: readonly T[], fields: readonly SearchField<T>[]): SearchIndex<T> {
  // Items often repeat values (one row per chart of a song), so each distinct string is normalized once.
  const seen = new Map<string, IndexedValue>();
  const indexValue = (value: string) => {
    let indexed = seen.get(value);
    if (!indexed) seen.set(value, indexed = indexOne(value));
    return indexed;
  };
  return {
    entries: items.map(item => ({
      item,
      fields: fields.map(field => {
        const raw = field.get(item);
        const list = raw == null ? [] : typeof raw === "string" ? [raw] : raw;
        return {
          values: list.filter((value): value is string => !!value).map(indexValue),
          weight: field.weight ?? 1,
          literal: field.literal ?? false,
        };
      }),
    })),
  };
}

const EXACT = 1000;
const PREFIX = 800;
const WORD_PREFIX = 650;
const SUBSTRING = 450;
const LOOSE = 350;
const FUZZY = 150;

function levenshteinWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      rowMin = Math.min(rowMin, current[j]!);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

function scoreValue(token: SearchQueryToken, value: IndexedValue, literal: boolean): number {
  if (literal) {
    if (value.literal === token.raw) return EXACT;
    return value.literal.startsWith(token.raw) ? PREFIX - (value.literal.length - token.raw.length) : 0;
  }
  const { text, loose } = token;
  if (!text) return 0;
  if (value.text === text) return EXACT;
  if (value.text.startsWith(text)) return PREFIX - Math.min(100, value.text.length - text.length);
  if (value.words.some(word => word.startsWith(text))) return WORD_PREFIX;
  const at = value.text.indexOf(text);
  if (at >= 0) return SUBSTRING - Math.min(100, at);
  if (loose.length >= 2 && value.loose.includes(loose)) return LOOSE;
  // Typos only count for tokens long enough that an edit still leaves them recognisable.
  if (text.length >= 4) {
    const allowed = text.length >= 8 ? 2 : 1;
    const candidates = [value.text.slice(0, text.length), ...value.words];
    for (const candidate of candidates) {
      const distance = levenshteinWithin(text, candidate.slice(0, text.length + allowed), allowed);
      if (distance <= allowed) return FUZZY - distance * 40;
    }
  }
  return 0;
}

function scoreField(token: SearchQueryToken, field: IndexedField): number {
  let best = 0;
  for (const value of field.values) best = Math.max(best, scoreValue(token, value, field.literal));
  return best * field.weight;
}

export type SearchHit<T> = { item: T; score: number };

/**
 * Items whose fields match every token, best first. A query typed with spaces also matches a field that has
 * none, such as a Japanese title, through the whole query joined together.
 */
export function searchIndex<T>(index: SearchIndex<T>, query: string | readonly SearchQueryToken[], { limit }: { limit?: number } = {}): SearchHit<T>[] {
  const tokens = typeof query === "string" ? parseSearchQuery(query) : query;
  if (tokens.length === 0) return [];
  const joined = tokens.length > 1 ? parseSearchQuery(tokens.map(token => token.raw).join("")) : [];

  const hits: SearchHit<T>[] = [];
  for (const entry of index.entries) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      let best = 0;
      for (const field of entry.fields) best = Math.max(best, scoreField(token, field));
      if (best === 0) {
        matchedAll = false;
        break;
      }
      total += best;
    }
    if (!matchedAll && joined.length === 1) {
      let best = 0;
      for (const field of entry.fields) best = Math.max(best, scoreField(joined[0]!, field));
      if (best > 0) {
        matchedAll = true;
        total = best * tokens.length;
      }
    }
    if (matchedAll) hits.push({ item: entry.item, score: total });
  }
  hits.sort((a, b) => b.score - a.score);
  return limit === undefined ? hits : hits.slice(0, limit);
}

/** Ranks `items` by `query` without keeping an index, for small lists searched once. */
export function searchItems<T>(items: readonly T[], fields: readonly SearchField<T>[], query: string, options?: { limit?: number }): T[] {
  return searchIndex(createSearchIndex(items, fields), query, options).map(hit => hit.item);
}
