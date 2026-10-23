import { env } from "@/env";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation"
import { findRouteBySlug, getRegistry, routeSlug } from "@/lib/api/specs";
import { resolveBaseUrl } from "@/lib/base-url";
import { ScopeBadge } from "@/components/developer/scope-badge";
import { ParamTable } from "@/components/developer/param-table";
import { ResponseTree } from "@/components/developer/response-tree";
import { ResponseTabs } from "@/components/developer/response-tabs";
import { responseTypeName, toTypeScript, toZod } from "@/lib/developer/schema-codegen";
import { z } from "zod";
import { ChevronRight, Terminal } from "lucide-react";
import { Badge } from "@tomomai/ui";
import { CodeSamples } from "@/components/developer/code-samples";
import { CodeBlock } from "@/components/developer/code-block";
import { highlight } from "@/lib/developer/highlight";
import { renderSnippet, SAMPLE_HIGHLIGHT, SAMPLE_LANGS } from "@/lib/developer/code-samples";
import { MethodBadge } from "@/components/developer/method-badge";
import type { RouteSpec } from "@/lib/api/registry";

/** TypeScript and Zod source for the response, or null when the schema cannot be expressed as JSON Schema. */
async function renderResponseCode(schema: z.ZodTypeAny, name: string) {
  let typescript: string;
  let zod: string;
  try {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
    typescript = toTypeScript(json, name);
    zod = toZod(json, name);
  } catch {
    return null;
  }
  return {
    typescript: { code: typescript, html: await highlight(typescript, "typescript") },
    zod: { code: zod, html: await highlight(zod, "typescript") },
  };
}

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
    env.NEXT_PUBLIC_APP_URL ??
    env.BETTER_AUTH_URL ??
    resolveBaseUrl();

  const scopes =
    spec.scope === "public" ? [] : Array.isArray(spec.scope) ? spec.scope : [spec.scope];

  const exampleUrl = buildExampleUrl(spec, baseUrl);
  const needsAuth = spec.scope !== "public";
  const [responseCode, samples] = await Promise.all([
    renderResponseCode(spec.response, responseTypeName(slug)),
    Promise.all(
      SAMPLE_LANGS.map(async (lang) => {
        const code = renderSnippet(lang, spec.method, exampleUrl, needsAuth);
        return { lang, code, html: await highlight(code, SAMPLE_HIGHLIGHT[lang]) };
      }),
    ),
  ]);

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
              title="Cost units consumed per call. See the Rate limits guide."
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
                        <span className="text-muted-foreground">{o.effect}</span>
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
          {responseCode ? (
            <ResponseTabs
              tree={<ResponseTree schema={spec.response} bare />}
              typescript={responseCode.typescript}
              zod={responseCode.zod}
            />
          ) : (
            <ResponseTree schema={spec.response} />
          )}
        </section>

        {spec.examples?.length ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Examples
            </h2>
            {spec.examples.map((ex) => (
              <div key={ex.name} className="space-y-2">
                <div className="text-sm font-medium">{ex.name}</div>
                <CodeBlock
                  code={JSON.stringify(ex.response, null, 2)}
                  lang="json"
                  className="rounded-lg border border-border bg-muted/30 [&_pre]:p-3"
                />
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
          <CodeSamples samples={samples} />
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
