import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { findRouteBySlug, getRegistry, routeSlug } from "@/lib/api/specs";
import { resolveBaseUrl } from "@tomomai/server/base-url";
import { ScopeBadge } from "@/components/developer/scope-badge";
import { ParamTable } from "@/components/developer/param-table";
import { ResponseTree } from "@/components/developer/response-tree";
import { ChevronRight, Terminal } from "lucide-react";
import { Badge } from "@tomomai/ui";
import { CodeSamples } from "@/components/developer/code-samples";
import { MethodBadge } from "@/components/developer/method-badge";
import type { RouteSpec } from "@/lib/api/registry";

function buildExampleUrl(spec: RouteSpec, baseUrl: string): string {
  let path = spec.path.replace(/\{(\w+)\}/g, (_, name) => `<${name}>`);
  const qs: string[] = [];
  if (spec.query) {
    const shape = (spec.query as unknown as { shape?: Record<string, unknown> }).shape;
    if (shape && "region" in shape) qs.push("region=intl");
  }
  return `${baseUrl}${path}${qs.length ? "?" + qs.join("&") : ""}`;
}

export function generateStaticParams() {
  return getRegistry().map((r) => ({ slug: routeSlug(r) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spec = findRouteBySlug(slug);
  if (!spec) return {};
  return {
    title: `${spec.method} ${spec.path}`,
    description: spec.summary,
  };
}

export default async function ReferenceEndpointPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spec = findRouteBySlug(slug);
  if (!spec) notFound();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    resolveBaseUrl();

  const scopes =
    spec.scope === "public" ? [] : Array.isArray(spec.scope) ? spec.scope : [spec.scope];

  const exampleUrl = buildExampleUrl(spec, baseUrl);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <article className="min-w-0 space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Link href="/developer/reference" className="hover:text-foreground">
              Reference
            </Link>
            <ChevronRight className="size-3" />
            <span>{spec.tag}</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <MethodBadge method={spec.method} size="md" />
            <code className="font-mono text-xl">{spec.path}</code>
          </h1>
          <p className="text-lg text-muted-foreground">{spec.summary}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/developer/guides/rate-limits"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title="Cost units consumed per call — see Rate Limits guide"
            >
              <span className="uppercase tracking-wider">Cost</span>
              <span className="font-semibold text-foreground">{spec.cost}</span>
              <span className="text-muted-foreground">{spec.cost === 1 ? "unit" : "units"}</span>
            </Link>
          </div>
          {spec.deprecated ? (
            <Badge
              variant="warning"
              className="text-xs"
            >
              Deprecated
            </Badge>
          ) : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Authorization
          </h2>
          {spec.scope === "public" ? (
            <div className="text-sm text-muted-foreground flex gap-2">
              <span>No authentication required.</span>
              <ScopeBadge scope="public" linked={false} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Required scope(s):</span>
                {scopes.map((s) => (
                  <ScopeBadge key={s} scope={s} />
                ))}
              </div>
              {spec.optionalScopes?.length ? (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Optional scopes:</div>
                  <ul className="space-y-1 pl-4">
                    {spec.optionalScopes.map((o) => (
                      <li key={o.scope} className="flex items-start gap-2">
                        <ScopeBadge scope={o.scope} />
                        <span className="text-muted-foreground">— {o.effect}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {spec.description ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h2>
            <p className="text-sm leading-relaxed text-foreground/90">{spec.description}</p>
          </section>
        ) : null}

        {spec.params ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Path parameters
            </h2>
            <ParamTable schema={spec.params} kind="path" />
          </section>
        ) : null}

        {spec.query ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Query parameters
            </h2>
            <ParamTable schema={spec.query} kind="query" />
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Response (200)
          </h2>
          <ResponseTree schema={spec.response} />
        </section>

        {spec.examples?.length ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Examples
            </h2>
            {spec.examples.map((ex) => (
              <div key={ex.name} className="space-y-2">
                <div className="text-sm font-medium">{ex.name}</div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <code>{JSON.stringify(ex.response, null, 2)}</code>
                </pre>
              </div>
            ))}
          </section>
        ) : null}
      </article>

      <aside className="lg:sticky lg:top-20 lg:h-fit lg:self-start">
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Terminal className="size-3.5" />
            Try it
          </h3>
          <CodeSamples
            method={spec.method}
            url={exampleUrl}
            needsAuth={spec.scope !== "public"}
          />
          <p className="text-xs text-muted-foreground">
            Need a key?{" "}
            <Link href="/settings/developer" className="underline">
              Create one
            </Link>
            .
          </p>
        </div>
      </aside>
    </div>
  );
}
