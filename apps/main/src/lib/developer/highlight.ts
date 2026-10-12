import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";
import rehypeShikiFromHighlighter, { type RehypeShikiCoreOptions } from "@shikijs/rehype/core";

const LANGS = ["bash", "javascript", "typescript", "python", "json", "http"] as const satisfies BundledLanguage[];
export type CodeLang = (typeof LANGS)[number] | "text";

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighter: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: Object.values(THEMES), langs: [...LANGS] });
  return highlighter;
}

/** Shiki HTML carrying both themes as CSS variables, switched by the `.shiki` rules in globals.css. */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang, themes: THEMES, defaultColor: false });
}

export async function rehypeShiki(): Promise<[typeof rehypeShikiFromHighlighter, Highlighter, RehypeShikiCoreOptions]> {
  const h = await getHighlighter();
  return [
    rehypeShikiFromHighlighter,
    h,
    { themes: THEMES, defaultColor: false, defaultLanguage: "text", fallbackLanguage: "text" },
  ];
}
