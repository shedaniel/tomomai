import type { ReactNode } from "react";

export type MarkdownExtension = {
  id: string;
  resolveStandaloneUrl(url: URL): { key: string; data: unknown } | null;
  render(resolved: { key: string; data: unknown }): ReactNode;
};

export type MarkdownPolicy = {
  allowedElements: readonly string[];
  allowHttpsLinks: boolean;
};

export type MarkdownLimits = { maxCharacters: number; maxUtf8Bytes: number };
export type MarkdownSize = { characters: number; utf8Bytes: number };
