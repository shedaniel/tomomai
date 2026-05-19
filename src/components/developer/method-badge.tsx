import { cn } from "@tomomai/ui";

const METHOD_STYLES: Record<string, string> = {
  GET: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  POST: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PUT: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PATCH: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  DELETE: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/**
 * Standalone, non-pill HTTP method indicator. Uses `rounded-md` (project
 * convention) rather than the `rounded-full` Badge default.
 */
export function MethodBadge({
  method,
  size = "sm",
}: {
  method: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-mono font-medium tracking-tight",
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        METHOD_STYLES[method] ?? "border-border bg-muted text-foreground",
      )}
    >
      {method}
    </span>
  );
}
