"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { safeHref, safeImg } from "@/lib/security/oauth-url";
import { Button } from "@tomomai/ui";
import { Badge } from "@tomomai/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { Loader2, ShieldCheck, ShieldAlert, Globe } from "lucide-react";

type OAuthClient = {
  name?: string;
  uri?: string;
  icon?: string;
  policy?: string;
  tos?: string;
};

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <OAuthConsent />
    </Suspense>
  );
}

function OAuthConsent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const clientId = searchParams.get("client_id") ?? "";
  const rawScope = searchParams.get("scope") ?? "";
  const requestedScopes = rawScope.split(" ").filter(Boolean) as ScopeKey[];

  const [client, setClient] = useState<OAuthClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setError("Missing client_id.");
      setLoading(false);
      return;
    }

    authClient.$fetch<OAuthClient>(`/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, {
      method: "GET",
    })
      .then((res) => {
        setClient((res as any).data ?? res);
      })
      .catch(() => setError("Failed to load application info."))
      .finally(() => setLoading(false));
  }, [clientId]);

  const knownScopes = requestedScopes.filter((s) => s in API_SCOPES);
  const unknownScopes = requestedScopes.filter((s) => !(s in API_SCOPES));
  const canAuthorize = unknownScopes.length === 0 && knownScopes.length > 0;

  async function handleConsent(accept: boolean) {
    if (accept && !canAuthorize) return;
    setSubmitting(true);
    setError(null);
    try {
      // Pass the known-scope subset explicitly so the server grants exactly
      // what the user sees, never a stale/unknown scope from the signed query.
      const body: Record<string, unknown> = { accept };
      if (accept) body.scope = knownScopes.join(" ");
      await authClient.$fetch("/oauth2/consent", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      // Better Auth will redirect the browser to the redirect_uri via a 302.
      // If the response is a redirect, the browser follows it automatically.
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Authorization Error
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => router.push("/")}>Go Home</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const iconHref = safeImg(client?.icon);
  const homepageHref = safeHref(client?.uri);
  const tosHref = safeHref(client?.tos);
  const policyHref = safeHref(client?.policy);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          {/* App icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-border overflow-hidden">
            {iconHref ? (
              <img src={iconHref} alt={client?.name ?? "App"} className="h-full w-full object-cover" />
            ) : (
              <Globe className="h-8 w-8 text-primary" />
            )}
          </div>

          <CardTitle className="text-xl">
            {client?.name ?? clientId} wants access
          </CardTitle>
          <CardDescription className="mt-1">
            This application is requesting permission to access your maimai data.
            {homepageHref && (
              <a
                href={homepageHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-1 text-primary hover:underline truncate"
              >
                {homepageHref}
              </a>
            )}
          </CardDescription>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <p className="text-sm font-medium mb-3">This app will be able to:</p>

          {knownScopes.length > 0 ? (
            <ul className="space-y-2">
              {knownScopes.map((scope) => {
                const def = API_SCOPES[scope];
                return (
                  <li key={scope} className="flex items-start gap-3 text-sm">
                    <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
                    <div>
                      <span className="font-medium">{def.name}</span>
                      {def.sensitive && (
                        <Badge variant="outline" className="ml-2 text-xs text-orange-500 border-orange-300">
                          Sensitive
                        </Badge>
                      )}
                      <p className="text-muted-foreground text-xs mt-0.5">{def.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No specific scopes requested.</p>
          )}

          {unknownScopes.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
              <p className="font-medium">Unrecognized permissions requested</p>
              <p className="mt-1">
                This application is asking for scopes that no longer exist or aren&apos;t supported: {unknownScopes.join(", ")}.
                Authorization is blocked until the application updates its request.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            You can revoke access at any time from your developer settings.
          </p>

          {(tosHref || policyHref) && (
            <div className="mt-2 flex gap-3 text-xs">
              {tosHref && (
                <a href={tosHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Terms of Service
                </a>
              )}
              {policyHref && (
                <a href={policyHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Privacy Policy
                </a>
              )}
            </div>
          )}
        </CardContent>

        <Separator />

        <CardFooter className="flex gap-3 pt-5">
          <Button
            variant="outline"
            className="flex-1"
            disabled={submitting}
            onClick={() => handleConsent(false)}
          >
            Deny
          </Button>
          <Button
            className="flex-1"
            disabled={submitting || !canAuthorize}
            onClick={() => handleConsent(true)}
            title={!canAuthorize ? "Cannot authorize: unrecognized or empty scopes" : undefined}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
