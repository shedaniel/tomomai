"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileJson, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelectFriendly,
  SelectFriendlyContent,
  SelectFriendlyItem,
  SelectFriendlyTrigger,
  SelectFriendlyValue,
} from "@tomomai/ui";
import { SiteHeader } from "./SiteHeader";

type Region = "intl" | "jp" | "cn";
type ExportRegion = "all" | Region;

type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; error?: string }
  | {
      status: "authenticated";
      me: { username: string | null; region: Region; publishProfile: boolean; role: string | null };
      scope: string;
    };

const OAUTH_ERROR_COPY: Record<string, string> = {
  oauth_denied: "Authorization was cancelled.",
  state_mismatch: "The OAuth state did not match. Please try signing in again.",
  issuer_mismatch: "The OAuth issuer did not match tomomai.",
  invalid_callback: "The OAuth callback was incomplete. Please try again.",
  token_exchange_failed: "tomomai could not exchange the authorization code.",
  takeout_oauth_not_configured: "Takeout OAuth is not configured on this deployment.",
};

const SCOPE_DISCLOSURE = [
  "User metadata and settings",
  "All snapshot metadata, songs, and events",
  "Profile icon URL",
  "Recent plays with detailed venue and note breakdowns",
  "Grade, full-combo, and full-sync stats",
  "Album metadata and image URLs",
];

function isSessionResponse(value: unknown): value is Extract<SessionState, { status: "authenticated" }> {
  if (typeof value !== "object" || value === null) return false;

  const record = value as { authenticated?: unknown; me?: unknown; scope?: unknown };
  if (record.authenticated !== true || typeof record.scope !== "string") return false;
  if (typeof record.me !== "object" || record.me === null) return false;

  const me = record.me as { username?: unknown; region?: unknown; publishProfile?: unknown; role?: unknown };
  return (
    (typeof me.username === "string" || me.username === null) &&
    (me.region === "intl" || me.region === "jp" || me.region === "cn") &&
    typeof me.publishProfile === "boolean" &&
    (typeof me.role === "string" || me.role === null)
  );
}

function oauthErrorFromUrl(): string | undefined {
  const error = new URLSearchParams(window.location.search).get("error");
  if (!error) return undefined;
  window.history.replaceState(null, "", "/");
  return OAUTH_ERROR_COPY[error] ?? "OAuth sign-in failed. Please try again.";
}

export function TakeoutClient() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [region, setRegion] = useState<ExportRegion>("all");
  const exportHref = useMemo(() => `/api/export?region=${region}`, [region]);

  useEffect(() => {
    let cancelled = false;
    const oauthError = oauthErrorFromUrl();

    async function loadSession() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setState({ status: "anonymous", error: oauthError });
          return;
        }

        const payload: unknown = await response.json();
        if (!cancelled && isSessionResponse(payload)) {
          setState({ status: "authenticated", me: payload.me, scope: payload.scope });
          return;
        }
      } catch {
        // Network failures leave the user on the sign-in surface.
      }

      if (!cancelled) setState({ status: "anonymous", error: oauthError });
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setState({ status: "anonymous" });
  }

  const authenticated = state.status === "authenticated";

  return (
    <main className="min-h-dvh px-4 pb-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <SiteHeader authenticated={authenticated} onSignOut={signOut} />
        <section className="grid gap-6 py-10 md:grid-cols-[1.1fr_0.9fr] md:items-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileJson className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-2xl">tomomai Takeout</CardTitle>
                  <CardDescription>
                    Download a JSON copy of the data exposed by your developer API scopes.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {state.status === "loading" ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Checking your tomomai session...
                </div>
              ) : null}

              {state.status === "anonymous" ? (
                <div className="space-y-4">
                  {state.error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {state.error}
                    </div>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    Sign in with tomomai to download a JSON copy of the data exposed by your developer
                    API scopes.
                  </p>
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href="/api/auth/start">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Sign in with tomomai
                    </a>
                  </Button>
                </div>
              ) : null}

              {state.status === "authenticated" ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Signed in</Badge>
                    <span className="text-sm text-muted-foreground">
                      {state.me.username ?? "Unnamed account"}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="region-select">
                      Region
                    </label>
                    <SelectFriendly value={region} onValueChange={(value) => setRegion(value as ExportRegion)}>
                      <SelectFriendlyTrigger id="region-select" className="w-full sm:w-64">
                        <SelectFriendlyValue placeholder="All regions" />
                      </SelectFriendlyTrigger>
                      <SelectFriendlyContent label="Region">
                        <SelectFriendlyItem value="all">All regions</SelectFriendlyItem>
                        <SelectFriendlyItem value="intl">International</SelectFriendlyItem>
                        <SelectFriendlyItem value="jp">Japan</SelectFriendlyItem>
                        <SelectFriendlyItem value="cn">China</SelectFriendlyItem>
                      </SelectFriendlyContent>
                    </SelectFriendly>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg">
                      <a href={exportHref}>
                        <Download className="size-4" aria-hidden="true" />
                        Download JSON
                      </a>
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={signOut}>
                      Sign out
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    The JSON uses raw main API encodings: achievement is scaled ×10000 and
                    levelPrecise is scaled ×10.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="bg-muted/20">
            <CardHeader>
              <CardTitle>Requested access</CardTitle>
              <CardDescription>Takeout only asks for read scopes needed by this export.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {SCOPE_DISCLOSURE.map((scope) => (
                  <li key={scope} className="flex gap-2">
                    <span className="mt-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />
                    <span>{scope}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
