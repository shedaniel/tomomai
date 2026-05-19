import Link from "next/link";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";

interface ScopeBadgeProps {
  scope: ScopeKey | "public";
  /** When true, links to /developer/scopes#<scope>. */
  linked?: boolean;
}

export function ScopeBadge({ scope, linked = true }: ScopeBadgeProps) {
  if (scope === "public") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        public
      </span>
    );
  }
  const meta = API_SCOPES[scope];
  const sensitive = meta?.sensitive;
  const className =
    "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium " +
    (sensitive
      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
      : "border-border bg-muted/60 text-foreground/80");

  const content = (
    <>
      {sensitive ? <span className="mr-1">⚠</span> : null}
      {scope}
    </>
  );
  if (!linked) return <span className={className}>{content}</span>;
  return (
    <Link href={`/developer/scopes#${slugifyScope(scope)}`} className={className}>
      {content}
    </Link>
  );
}

export function slugifyScope(scope: string): string {
  return scope.replace(/:/g, "-");
}

/** Tiny global style island — keeps long scope strings from breaking layout. */
export function ScopeBadgeCss() {
  return null;
}
