"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { safeHref, safeImg } from "@/lib/security/oauth-url";
import { Button, cn } from "@tomomai/ui";
import { Badge } from "@tomomai/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { Loader2, ShieldAlert, Globe, ShieldOff, ShieldUser, ShieldQuestionMark } from "lucide-react";

type OAuthClient = {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
  redirect_uris?: string[];
};

function scopeRiskRank(scope: ScopeKey): number {
  const def = API_SCOPES[scope];
  if (def.destructive) return 2;
  if (def.sensitive) return 1;
  return 0;
}

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

    authClient.$fetch<OAuthClient & { data?: OAuthClient }>(`/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, {
      method: "GET",
    })
      .then((res) => {
        const payload = res as OAuthClient & { data?: OAuthClient };
        setClient(payload.data ?? payload);
      })
      .catch(() => setError("Failed to load application info."))
      .finally(() => setLoading(false));
  }, [clientId]);

  const knownScopes = requestedScopes
    .filter((s) => s in API_SCOPES)
    .sort((a, b) => scopeRiskRank(a) - scopeRiskRank(b));
  const unknownScopes = requestedScopes.filter((s) => !(s in API_SCOPES));
  const canAuthorize = unknownScopes.length === 0 && knownScopes.length > 0;

  async function handleConsent(accept: boolean) {
    if (accept && !canAuthorize) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await authClient.oauth2.consent({
        accept,
        ...(accept ? { scope: knownScopes.join(" ") } : {}),
      });
      if (result.error) throw new Error(result.error.message ?? "Something went wrong.");
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      throw new Error("OAuth consent did not return a redirect URL.");
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

  const iconHref = safeImg(client?.logo_uri);
  const appName = client?.client_name ?? clientId;
  const homepageHref = safeHref(client?.client_uri);
  const tosHref = safeHref(client?.tos_uri);
  const policyHref = safeHref(client?.policy_uri);
  const missingLegalDocs = [
    !tosHref ? "Terms of Service" : null,
    !policyHref ? "Privacy Policy" : null,
  ].filter((label): label is string => label !== null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-muted/20 p-4 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-55"
        style={{
          backgroundImage: [
            "linear-gradient(color-mix(in oklch, var(--foreground) 1.8%, transparent) 1px, transparent 1px)",
            "linear-gradient(90deg, color-mix(in oklch, var(--foreground) 1.8%, transparent) 1px, transparent 1px)",
            "repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 2%, transparent) 0 1px, transparent 1px 12px)",
            "radial-gradient(color-mix(in oklch, var(--foreground) 3.5%, transparent) 0.6px, transparent 0.8px)",
          ].join(", "),
          backgroundSize: "3.5rem 3.5rem, 3.5rem 3.5rem, auto, 18px 18px",
        }}
      />
      <Card className="relative w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 border border-border overflow-hidden">
              {iconHref ? (
                <img src={iconHref} alt={appName} className="h-full w-full object-cover" />
              ) : (
                <Globe className="h-7 w-7 text-primary" />
              )}
            </div>

            <CardTitle className="text-left text-xl">
              {homepageHref ? (
                <a
                  href={homepageHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {appName}
                </a>
              ) : (
                appName
              )}{" "}
              wants access
            </CardTitle>
          </div>
          <CardDescription>
            <p className="text-left">
              This application is requesting permission to access your tomomai data.
            </p>
          </CardDescription>
        </CardHeader>

        <Separator />

        <CardContent>
          <p className="text-sm font-medium mb-3">This app will be able to:</p>

          {knownScopes.length > 0 ? (
            <ul className="space-y-2">
              {knownScopes.map((scope) => {
                const def = API_SCOPES[scope];
                return (
                  <li key={scope} className="flex items-start gap-3 text-sm">
                    {def.destructive ? (
                      <ShieldOff className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                    ) : def.sensitive ? (
                      <ShieldUser className="h-4 w-4 mt-0.5 shrink-0 text-tertiary/75" />
                    ) : (
                      <ShieldQuestionMark className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    )}
                    <div>
                      <span className="font-medium">{def.name}</span>
                      {def.sensitive && (
                        <Badge variant="outline" className="ml-2 text-xs bg-tertiary/10 text-tertiary border-0">
                          Sensitive
                        </Badge>
                      )}
                      {def.destructive && (
                        <Badge variant="outline" className="ml-2 text-xs bg-destructive/10 text-destructive border-destructive/50">
                          Destructive
                        </Badge>
                      )}
                      <p className="text-muted-foreground text-2xs font-normal mt-0.3 text-pretty">{def.description}</p>
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

          {(tosHref || policyHref) && (
            <p className="mt-4 text-xs text-muted-foreground">
              Before authorizing, read the application&apos;s{" "}
              {tosHref && (
                <a href={tosHref} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  Terms of Service
                </a>
              )}
              {tosHref && policyHref && " and "}
              {policyHref && (
                <a href={policyHref} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  Privacy Policy
                </a>
              )}
              .
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            You can revoke access at any time from your developer settings.
          </p>

          <div className={`mt-4 rounded-md border p-3 text-xs text-muted-foreground ${missingLegalDocs.length > 0 ? "border-destructive/50 bg-destructive/5" : "bg-muted/40"}`}>
            <div className="flex gap-2">
              <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${missingLegalDocs.length > 0 ? "text-destructive" : "text-foreground"}`} />
              <div className="space-y-1">
                {missingLegalDocs.length > 0 ? (
                  <p className="font-semibold text-destructive text-balance">
                    This application has not provided a {missingLegalDocs.join(" or ")}.
                  </p>
                ) : (
                  <p className="font-semibold text-foreground text-balance">
                    This application is a third-party application and is not associated with tomomai.
                  </p>
                )}
                <p className={cn(missingLegalDocs.length > 0 && "text-destructive/75")}>
                  tomomai is not responsible for how this application stores, uses, or shares your data.
                  Once data leaves tomomai, it is controlled by the application you authorize.
                </p>
              </div>
            </div>
          </div>

        </CardContent>

        <Separator />

        <CardFooter className="flex gap-3">
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
