import { cn } from "@/lib/utils";

/** Renders Shiki output, which escapes the source text. */
export function HighlightedCode({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn("[&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-xs", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
