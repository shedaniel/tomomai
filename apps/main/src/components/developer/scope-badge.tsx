import { Link } from "@/i18n/navigation"
import { AlertTriangle } from "lucide-react";
import { Badge } from "@tomomai/ui";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { cn } from "@tomomai/ui";

interface ScopeBadgeProps {
  scope: ScopeKey | "public";
  /** When true, links to /developer/scopes#<scope>. */
  linked?: boolean;
}

export function ScopeBadge({ scope, linked = true }: ScopeBadgeProps) {
  if (scope === "public") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
      >
        public
      </Badge>
    );
  }
  const meta = API_SCOPES[scope];
  const sensitive = meta?.sensitive;
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-mono text-[11px] font-medium",
        sensitive
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "bg-muted/60 text-foreground/80",
      )}
    >
      {sensitive ? <AlertTriangle className="size-3" /> : null}
      {scope}
    </Badge>
  );
  if (!linked) return badge;
  return (
    <Link
      href={`/developer/scopes#${slugifyScope(scope)}`}
      className="inline-flex transition hover:opacity-80"
    >
      {badge}
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
