import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { Locale } from "@/i18n/locale";
import { locales } from "@/i18n/locale";
import * as OpenCC from "opencc-js";

const postsDirectory = path.join(process.cwd(), "content/posts");

// Initialize OpenCC converters
const twToCnConverter = OpenCC.Converter({ from: "tw", to: "cn" });
const twToHkConverter = OpenCC.Converter({ from: "tw", to: "hk" });

/**
 * Convert Traditional Chinese (TW) text to Simplified Chinese using OpenCC
 */
function convertToSimplifiedChinese(text: string): string {
  return twToCnConverter(text);
}

/**
 * Convert Traditional Chinese (TW) text to Hong Kong Traditional Chinese using OpenCC
 */
function convertToHongKongChinese(text: string): string {
  return twToHkConverter(text);
}

export interface PostMeta {
  slug: string;              // canonical slug (without locale suffix)
  locale: string;            // current locale
  title: string;
  date: string;
  version: string;
  summary: string;
  canonicalSlug: string;     // for cross-referencing translations
}

export interface Post extends PostMeta {
  content: string;
}

/**
 * Get the fallback chain for a given locale
 * zh-HK and zh-CN fall back to zh-TW before English
 * zh-SG falls back through zh-CN → zh-TW (both simplified-Chinese sources work)
 * All other locales fall back directly to English
 */
function getLocaleFallbackChain(locale: Locale): string[] {
  const chain: string[] = [locale];

  if (locale === "zh-HK" || locale === "zh-CN" || locale === "zh-MS") {
    chain.push("zh-TW");
  } else if (locale === "zh-SG") {
    chain.push("zh-CN", "zh-TW");
  }

  // Always fall back to English at the end (if not already English)
  if (locale !== "en") {
    chain.push("en");
  }

  return chain;
}

/**
 * Get all posts for a specific locale with fallback to English
 */
export function getAllPostsMeta(locale: Locale): PostMeta[] {
  if (!fs.existsSync(postsDirectory)) return [];

  const files = fs.readdirSync(postsDirectory).filter((f) => f.endsWith(".mdx"));

  // Group files by canonical slug
  const postsBySlug = new Map<string, Map<string, string>>();

  for (const filename of files) {
    // Extract canonical slug and locale from filename
    // Format: YYYY-MM-DD-slug.locale.mdx
    const match = filename.match(/^(.+)\.([a-z]{2}(?:-[A-Z]{2})?)\.mdx$/);
    if (!match) continue;

    const [, canonicalSlug, fileLocale] = match;

    if (!postsBySlug.has(canonicalSlug)) {
      postsBySlug.set(canonicalSlug, new Map());
    }
    postsBySlug.get(canonicalSlug)!.set(fileLocale, filename);
  }

  const posts: PostMeta[] = [];

  // For each canonical post, try to load the requested locale with fallback chain
  for (const [canonicalSlug, localeFiles] of postsBySlug.entries()) {
    let selectedFile: string | undefined;
    let selectedLocale: string | undefined;

    // Try each locale in the fallback chain
    const fallbackChain = getLocaleFallbackChain(locale);
    for (const fallbackLocale of fallbackChain) {
      if (localeFiles.has(fallbackLocale)) {
        selectedFile = localeFiles.get(fallbackLocale);
        selectedLocale = fallbackLocale;
        break;
      }
    }

    // Skip if no suitable locale found
    if (!selectedFile || !selectedLocale) continue;

    const filePath = path.join(postsDirectory, selectedFile);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(fileContent);

    // Check if we need to convert Traditional Chinese
    const needsCnConversion =
      (locale === "zh-CN" || locale === "zh-SG") && selectedLocale === "zh-TW";
    const needsHkConversion = locale === "zh-HK" && selectedLocale === "zh-TW";
    const convertText = needsCnConversion ? convertToSimplifiedChinese
      : needsHkConversion ? convertToHongKongChinese
      : null;

    posts.push({
      slug: canonicalSlug,
      locale: convertText ? locale : selectedLocale,
      title: convertText ? convertText(data.title as string) : data.title as string,
      date: data.date as string,
      version: data.version as string,
      summary: convertText ? convertText(data.summary as string) : data.summary as string,
      canonicalSlug: data.canonicalSlug as string || canonicalSlug,
    });
  }

  return posts.sort((a, b) => (a.date > b.date ? -1 : 1));
}

/**
 * Get a specific post by canonical slug and locale with fallback chain
 * zh-HK and zh-CN fall back to zh-TW before English
 * zh-SG falls back zh-CN → zh-TW (using zh-CN as-is, or converting from zh-TW)
 * zh-CN/zh-HK/zh-SG content from zh-TW is automatically converted via OpenCC
 */
export function getPostBySlug(slug: string, locale: Locale): Post | null {
  // Try each locale in the fallback chain
  const fallbackChain = getLocaleFallbackChain(locale);
  let filePath: string | null = null;

  for (const fallbackLocale of fallbackChain) {
    const testPath = path.join(postsDirectory, `${slug}.${fallbackLocale}.mdx`);
    if (fs.existsSync(testPath)) {
      filePath = testPath;
      break;
    }
  }

  // No suitable file found in fallback chain
  if (!filePath) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);

  // Extract locale from filename
  const filename = path.basename(filePath);
  const match = filename.match(/^(.+)\.([a-z]{2}(?:-[A-Z]{2})?)\.mdx$/);
  const actualLocale = match ? match[2] : "en";

  // Check if we need to convert Traditional Chinese
  const needsCnConversion =
    (locale === "zh-CN" || locale === "zh-SG") && actualLocale === "zh-TW";
  const needsHkConversion = locale === "zh-HK" && actualLocale === "zh-TW";
  const convertText = needsCnConversion ? convertToSimplifiedChinese
    : needsHkConversion ? convertToHongKongChinese
    : null;

  return {
    slug,
    locale: convertText ? locale : actualLocale,
    title: convertText ? convertText(data.title as string) : data.title as string,
    date: data.date as string,
    version: data.version as string,
    summary: convertText ? convertText(data.summary as string) : data.summary as string,
    canonicalSlug: data.canonicalSlug as string || slug,
    content: convertText ? convertText(content) : content,
  };
}

/**
 * Get available translations for a specific post
 * Includes both physical files and virtual translations (auto-converted from zh-TW)
 */
export function getAvailableTranslations(canonicalSlug: string): Locale[] {
  if (!fs.existsSync(postsDirectory)) return [];

  const files = fs.readdirSync(postsDirectory).filter((f) => f.endsWith(".mdx"));
  const translations: Locale[] = [];

  for (const filename of files) {
    // Check if file matches the canonical slug pattern
    const match = filename.match(/^(.+)\.([a-z]{2}(?:-[A-Z]{2})?)\.mdx$/);
    if (!match) continue;

    const [, fileCanonicalSlug, locale] = match;

    if (fileCanonicalSlug === canonicalSlug) {
      translations.push(locale as Locale);
    }
  }

  // Add virtual translations that can be generated from zh-TW
  const hasZhTW = translations.includes("zh-TW");

  if (hasZhTW) {
    // zh-CN, zh-HK, zh-SG, and zh-MS can be auto-converted from zh-TW
    if (!translations.includes("zh-CN")) {
      translations.push("zh-CN");
    }
    if (!translations.includes("zh-HK")) {
      translations.push("zh-HK");
    }
    if (!translations.includes("zh-SG")) {
      translations.push("zh-SG");
    }
    if (!translations.includes("zh-MS")) {
      translations.push("zh-MS");
    }
  } else if (translations.includes("zh-CN") && !translations.includes("zh-SG")) {
    // zh-SG can also use zh-CN directly (both are simplified)
    translations.push("zh-SG");
  }

  // Sort translations using the canonical locale order from @/i18n/locale
  return translations.sort((a, b) => {
    const orderA = locales.indexOf(a);
    const orderB = locales.indexOf(b);

    // If locale not found in canonical list, put it at the end
    const finalOrderA = orderA === -1 ? 999 : orderA;
    const finalOrderB = orderB === -1 ? 999 : orderB;

    return finalOrderA - finalOrderB;
  });
}

/**
 * Get the latest post for a specific locale
 */
export function getLatestPost(locale: Locale): PostMeta | null {
  const posts = getAllPostsMeta(locale);
  return posts[0] ?? null;
}
