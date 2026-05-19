import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck, Webhook } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomomai/ui";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { listGuides } from "@/lib/developer/guides";
import { LinkButton } from "@/components/developer/link-button";
import { MethodBadge } from "@/components/developer/method-badge";

export default async function DeveloperHome() {
  const routes = getRegistry();
  const guides = await listGuides();

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">tomomai Developer Center</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          Build with the tomomai API. Use a personal API key for your own
          scripts, or register an OAuth 2.1 app so other users can sign in.
          Every endpoint is documented here, derived from the same Zod schemas
          the server validates against.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <LinkButton href="/developer/guides/api-keys">
            <KeyRound className="size-4" />
            Get an API key
            <ArrowRight className="size-4" />
          </LinkButton>
          <LinkButton href="/developer/guides/oauth" variant="outline">
            <ShieldCheck className="size-4" />
            Set up OAuth
          </LinkButton>
          <LinkButton href="/developer/reference" variant="outline">
            <Webhook className="size-4" />
            Browse the API
          </LinkButton>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Guides</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {guides.map((g) => (
            <Link
              key={g.slug}
              href={`/developer/guides/${g.slug}`}
              className="group rounded-lg border border-border p-4 transition hover:border-foreground/40 hover:bg-muted/40"
            >
              <div className="font-medium group-hover:underline">{g.title}</div>
              {g.description ? (
                <div className="mt-1 text-sm text-muted-foreground">{g.description}</div>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">All endpoints</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((r) => (
                <TableRow key={routeSlug(r)} className="align-top">
                  <TableCell>
                    <MethodBadge method={r.method} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/developer/reference/${routeSlug(r)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {r.path}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
