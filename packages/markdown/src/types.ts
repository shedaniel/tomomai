import type { ReactNode } from "react";

export type ResolvedStandaloneUrl = {
  key: string;
  data: unknown;
  /** Shortest equivalent of the source URL, inserted in place of what was pasted. */
  canonicalUrl?: string;
};

export type MarkdownExtension = {
  id: string;
  resolveStandaloneUrl(url: URL): ResolvedStandaloneUrl | null;
  render(resolved: { key: string; data: unknown }): ReactNode;
};

export type MarkdownPolicy = {
  allowedElements: readonly string[];
  allowHttpsLinks: boolean;
};

export type MarkdownLimits = { maxCharacters: number; maxUtf8Bytes: number };
export type MarkdownSize = { characters: number; utf8Bytes: number };
