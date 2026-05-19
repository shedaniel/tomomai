import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { listGuides } from "@/lib/developer/guides";
import { ScopeBadgeCss } from "@/components/developer/scope-badge";

export const metadata: Metadata = {
  title: { default: "Developer Center", template: "%s — tomomai Developer Center" },
  description:
    "Build with the tomomai API. Personal API keys, OAuth 2.1, scopes, and " +
    "reference for every /api/v1/* endpoint.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const routes = getRegistry();
  const guides = await listGuides();

  // Group routes by tag for sidebar
  const grouped = new Map<string, typeof routes>();
  for (const r of routes) {
    const list = grouped.get(r.tag) ?? [];
    list.push(r);
    grouped.set(r.tag, list);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ScopeBadgeCss />
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/developer" className="font-semibold tracking-tight">
              tomomai <span className="text-muted-foreground">/ developers</span>
            </Link>
            <nav className="hidden gap-4 text-sm text-muted-foreground sm:flex">
              <Link href="/developer" className="hover:text-foreground">Overview</Link>
              <Link href="/developer/reference" className="hover:text-foreground">Reference</Link>
              <Link href="/developer/scopes" className="hover:text-foreground">Scopes</Link>
              <Link href="/settings/developer" className="hover:text-foreground">Your keys</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a
              href="/developer/openapi.json"
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              OpenAPI
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-8 px-4 py-8 sm:px-6">
        <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-60 shrink-0 overflow-y-auto pr-2 text-sm md:block">
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Guides
            </div>
            <ul className="space-y-0.5">
              {guides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/developer/guides/${g.slug}`}
                    className="block rounded px-2 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Concepts
            </div>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href="/developer/scopes"
                  className="block rounded px-2 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Scopes
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reference
            </div>
            {Array.from(grouped.entries()).map(([tag, list]) => (
              <div key={tag} className="mb-3">
                <div className="px-2 py-1 text-xs font-medium text-foreground/80">{tag}</div>
                <ul className="space-y-0.5">
                  {list.map((r) => (
                    <li key={routeSlug(r)}>
                      <Link
                        href={`/developer/reference/${routeSlug(r)}`}
                        className="flex items-center gap-2 rounded px-2 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <span className="font-mono text-[10px] text-foreground/60">{r.method}</span>
                        <span className="truncate">{r.path.replace(/^\/api\/v1/, "")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
