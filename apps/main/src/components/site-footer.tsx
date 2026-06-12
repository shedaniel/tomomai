import { getAppVersion } from "@/lib/version";

export function SiteFooter() {
  const { display } = getAppVersion();

  return (
    <footer className="mt-auto border-t border-border/40 px-4 py-3 text-center">
      <span className="font-mono text-xs text-muted-foreground/70">
        {display}
      </span>
    </footer>
  );
}
