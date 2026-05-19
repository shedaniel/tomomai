import Link from "next/link";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { listGuides } from "@/lib/developer/guides";

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
          <Link
            href="/developer/guides/api-keys"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get an API key →
          </Link>
          <Link
            href="/developer/guides/oauth"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Set up OAuth
          </Link>
          <Link
            href="/developer/reference"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Browse the API
          </Link>
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
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={routeSlug(r)} className="border-t border-border">
                  <td className="px-3 py-2 align-top">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {r.method}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/developer/reference/${routeSlug(r)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {r.path}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
