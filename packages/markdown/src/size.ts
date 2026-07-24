import type { MarkdownLimits, MarkdownSize } from "./types";

export function measureMarkdown(value: string): MarkdownSize {
  return {
    characters: Array.from(value).length,
    utf8Bytes: typeof window === "undefined"
      ? Buffer.byteLength(value, "utf8")
      : new TextEncoder().encode(value).byteLength,
  };
}

export function validateMarkdownSize(
  value: string,
  limits: MarkdownLimits,
): { ok: true; size: MarkdownSize } | { ok: false; size: MarkdownSize; exceeded: "characters" | "bytes" } {
  const size = measureMarkdown(value);
  if (size.characters > limits.maxCharacters) return { ok: false, size, exceeded: "characters" };
  if (size.utf8Bytes > limits.maxUtf8Bytes) return { ok: false, size, exceeded: "bytes" };
  return { ok: true, size };
}
