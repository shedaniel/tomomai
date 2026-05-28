import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@tomomai/ui";
import { API_SCOPES, SCOPE_EXPANSIONS, SCOPE_IMPLIES, type ScopeKey } from "@/lib/api/scopes";
import { slugifyScope } from "@/components/developer/scope-badge";

export const metadata: Metadata = {
  title: "Scopes",
  description:
    "Every scope tomomai uses to gate access to its API — what each one " +
    "covers, which are sensitive, and how they expand.",
};

const GROUPS: { title: string; match: (s: ScopeKey) => boolean }[] = [
  { title: "Always-on", match: (s) => s === "ready" },
  { title: "User", match: (s) => s.startsWith("user:") },
  { title: "Latest snapshot", match: (s) => s.startsWith("snapshot:latest:") },
  { title: "All snapshots", match: (s) => s.startsWith("snapshot:all:") },
  { title: "Recents", match: (s) => s.startsWith("recent:") },
  { title: "Stats", match: (s) => s.startsWith("stats:") },
  { title: "Albums", match: (s) => s.startsWith("album:") },
  { title: "Plates", match: (s) => s.startsWith("plate:") },
  { title: "Fetch", match: (s) => s.startsWith("fetch:") },
  {
    title: "Bundles",
    match: (s) => s === "read" || s === "snapshot:latest:read" || s === "snapshot:all:read",
  },
];

export default function ScopesPage() {
  const allScopes = Object.keys(API_SCOPES) as ScopeKey[];
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Concept</div>
        <h1 className="text-3xl font-semibold tracking-tight">Scopes</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every protected request is checked against one or more scopes. A
          token holds a set of scopes; the endpoint declares a required set;
          the request succeeds only if the token covers them. Bundles expand
          to their leaves at the moment a key is created — only the leaves
          are stored.
        </p>
      </header>

      {GROUPS.map((group) => {
        const items = allScopes.filter(group.match);
        if (!items.length) return null;
        return (
          <section key={group.title} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
            <ul className="space-y-2">
              {items.map((scope) => {
                const meta = API_SCOPES[scope];
                const expansion = SCOPE_EXPANSIONS[scope];
                const implies = SCOPE_IMPLIES[scope];
                return (
                  <li
                    key={scope}
                    id={slugifyScope(scope)}
                    className="rounded-lg border border-border p-4 scroll-mt-20"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded-sm bg-muted px-2 py-0.5 font-mono text-sm">
                        {scope}
                      </code>
                      {meta.sensitive ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-200"
                        >
                          <AlertTriangle className="size-3" />
                          Sensitive
                        </Badge>
                      ) : null}
                      {meta.default ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                        >
                          <CheckCircle2 className="size-3" />
                          Granted by default
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{meta.name}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{meta.description}</p>
                    {expansion ? (
                      <div className="mt-3 text-xs text-muted-foreground flex flex-wrap gap-1">
                        <span className="font-medium text-foreground/80">Expands to:</span>{" "}
                        {expansion.map((e) => (
                          <code
                            key={e}
                            className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px]"
                          >
                            {e}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    {implies ? (
                      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-1">
                        <span className="font-medium text-foreground/80">Also grants:</span>{" "}
                        {implies.map((e) => (
                          <code
                            key={e}
                            className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px]"
                          >
                            {e}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
