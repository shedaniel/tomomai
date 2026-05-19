import Link from "next/link";
import type { Metadata } from "next";
import { FileCode2 } from "lucide-react";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { ScopeBadge } from "@/components/developer/scope-badge";
import { MethodBadge } from "@/components/developer/method-badge";

export const metadata: Metadata = {
  title: "API reference",
  description: "Every /api/v1/* endpoint, derived from code.",
};

export default function ReferenceIndex() {
  const routes = getRegistry();
  const grouped = new Map<string, typeof routes>();
  for (const r of routes) {
    const list = grouped.get(r.tag) ?? [];
    list.push(r);
    grouped.set(r.tag, list);
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Reference</div>
        <h1 className="text-3xl font-semibold tracking-tight">API endpoints</h1>
        <p className="max-w-3xl text-muted-foreground">
          Click an endpoint to see its required scope, query parameters,
          response schema, and a runnable `curl` example. The full machine
          spec is available at{" "}
          <Link
            href="/developer/openapi.json"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <FileCode2 className="size-3.5" />
            /developer/openapi.json
          </Link>
          .
        </p>
      </header>

      {Array.from(grouped.entries()).map(([tag, list]) => (
        <section key={tag} className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{tag}</h2>
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={routeSlug(r)}>
                <Link
                  href={`/developer/reference/${routeSlug(r)}`}
                  className="flex flex-col gap-1 rounded-lg border border-border p-4 transition hover:border-foreground/40 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <MethodBadge method={r.method} size="md" />
                  <code className="font-mono text-sm">{r.path}</code>
                  <span className="flex-1 text-sm text-muted-foreground">{r.summary}</span>
                  <ScopeBadge
                    scope={Array.isArray(r.scope) ? r.scope[0] : r.scope}
                    linked={false}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
