import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { findRouteBySlug, getRegistry, routeSlug } from "@/lib/api/specs";
import { resolveBaseUrl } from "@/lib/base-url";
import { ScopeBadge } from "@/components/developer/scope-badge";
import { ParamTable } from "@/components/developer/param-table";
import { ResponseTree } from "@/components/developer/response-tree";
import { CodeSamples } from "@/components/developer/code-samples";
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
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Link href="/developer/reference" className="hover:text-foreground">
              Reference
            </Link>
            <span>/</span>
            <span>{spec.tag}</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-base">{spec.method}</span>
            <code className="font-mono text-xl">{spec.path}</code>
          </h1>
          <p className="text-lg text-muted-foreground">{spec.summary}</p>
          {spec.deprecated ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              This endpoint is deprecated.
            </div>
          ) : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Authorisation
          </h2>
          {spec.scope === "public" ? (
            <p className="text-sm text-muted-foreground">
              No authentication required. <ScopeBadge scope="public" linked={false} />
            </p>
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
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
