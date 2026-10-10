"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, Check, ChevronRight, RefreshCw, ExternalLink, Loader2, Pencil, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import { Button, Skeleton } from "@tomomai/ui";
import { Link } from "@/i18n/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { useAuthDialog } from "@/components/auth/auth-dialog-provider";
import { API_SCOPES, OFFLINE_ACCESS, type ScopeKey } from "@/lib/api/scopes";
import { grantedScopeTree, type TreeNode } from "@/lib/api/scope-tree";
import { safeHref, safeImg } from "@/lib/security/oauth-url";
import { cn } from "@/lib/utils";
import { consentErrorKind, readOAuthAuthorizeError, type ConsentErrorKind } from "@/lib/oauth-errors";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { isCNExclusive } from "@/lib/enabled-regions";
import { AnimatePresence, motion } from "motion/react";
import { getTransition } from "@/lib/animation-constants";

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
};

type ClientState =
  | { status: "loading" }
  | { status: "ready"; client: PublicClient }
  | { status: "error"; kind: "tampered" | "loadFailed" };

const SIGNED_QUERY_PARAMS = ["sig", "exp", "ba_iat", "ba_pl"];

/** Restarting at /authorize re-signs the request, and skips consent the user already gave. */
function authorizeUrl(params: URLSearchParams) {
  const query = new URLSearchParams(params);
  for (const key of SIGNED_QUERY_PARAMS) query.delete(key);
  return `/api/auth/oauth2/authorize?${query}`;
}

function isExpired(params: URLSearchParams) {
  const exp = Number(params.get("exp"));
  return Number.isFinite(exp) && exp > 0 && exp * 1000 <= Date.now();
}

function hostOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<ConsentShell><LoadingCard /></ConsentShell>}>
      <OAuthConsent />
    </Suspense>
  );
}

function OAuthConsent() {
  const t = useTranslations("oauthConsent");
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();
  const { openAuthDialog } = useAuthDialog();

  const authorizeError = readOAuthAuthorizeError(searchParams);
  const clientId = searchParams.get("client_id") ?? "";
  const requestedScopes = (searchParams.get("scope") ?? "").split(" ").filter(Boolean);
  const knownScopes = requestedScopes.filter((s): s is ScopeKey => s in API_SCOPES);
  const wantsOfflineAccess = requestedScopes.includes(OFFLINE_ACCESS);
  const unknownScopes = requestedScopes.filter((s) => !(s in API_SCOPES) && s !== OFFLINE_ACCESS);
  const canAuthorize = unknownScopes.length === 0 && knownScopes.length > 0;
  const redirectHost = hostOf(searchParams.get("redirect_uri"));

  const [state, setState] = useState<ClientState>({ status: "loading" });
  const [submitting, setSubmitting] = useState<"accept" | "deny" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { attach: attachScroll, atEnd, reviewed, scrollToEnd } = useScrollReview();
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!clientId || authorizeError) return;
    if (isExpired(searchParams)) {
      window.location.replace(authorizeUrl(searchParams));
      return;
    }
    let cancelled = false;
    // The prelogin lookup works signed in or out. The oauthProvider client plugin attaches the signed query.
    authClient
      .$fetch<PublicClient>("/oauth2/public-client-prelogin", { method: "POST", body: { client_id: clientId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data && !error) setState({ status: "ready", client: data });
        // The signed query only fails verification when part of the consent link was edited.
        else setState({ status: "error", kind: (error as { error?: string } | null)?.error === "invalid_signature" ? "tampered" : "loadFailed" });
      })
      .catch(() => !cancelled && setState({ status: "error", kind: "loadFailed" }));
    return () => {
      cancelled = true;
    };
  }, [clientId, authorizeError, searchParams]);

  const errorKind: ConsentErrorKind | null = authorizeError
    ? consentErrorKind(authorizeError)
    : !clientId
      ? "missingClient"
      : state.status === "error"
        ? state.kind
        : null;
  if (errorKind) {
    return (
      <ConsentShell>
        <ErrorCard kind={errorKind} />
      </ConsentShell>
    );
  }
  if (state.status !== "ready" || sessionPending) {
    return <ConsentShell><LoadingCard /></ConsentShell>;
  }

  const { client } = state;
  const appName = client.client_name?.trim() || t("defaultAppName");
  const signedIn = !!session?.user;

  // Restarting the request after sign-out lands on the signed-out consent screen, ready for another account.
  async function switchAccount() {
    setSwitching(true);
    await authClient.signOut();
    window.location.assign(authorizeUrl(searchParams));
  }

  async function decide(accept: boolean) {
    if (accept && !canAuthorize) return;
    if (isExpired(searchParams)) {
      window.location.replace(authorizeUrl(searchParams));
      return;
    }
    setSubmitting(accept ? "accept" : "deny");
    setSubmitError(null);
    // Grant exactly the scopes shown, never a stale or unknown one from the signed query.
    const { error } = await authClient.$fetch("/oauth2/consent", {
      method: "POST",
      body: accept ? { accept, scope: [...knownScopes, ...(wantsOfflineAccess ? [OFFLINE_ACCESS] : [])].join(" ") } : { accept },
    });
    if (error) {
      setSubmitError(t("genericError"));
      setSubmitting(null);
    }
  }

  return (
    <ConsentShell>
      <article className="flex max-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-[var(--consent-radius)] border border-border bg-card shadow-xl shadow-black/5">
        {/* Only the body scrolls, so the decision buttons stay in view however long the list is. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={attachScroll}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        >
        <div>
        <header
          className="flex flex-col items-center px-6 pt-8 pb-6 text-center"
          style={{ backgroundImage: "linear-gradient(180deg, color-mix(in srgb, var(--primary) 12%, transparent), transparent)" }}
        >
          <div className="flex items-center gap-3" aria-hidden>
            <AppMark client={client} name={appName} />
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1 rounded-full bg-muted-foreground/40" />
              ))}
            </span>
            <span className="flex size-14 overflow-hidden rounded-[1rem] border border-border bg-white">
              <img src="/icon.png" alt="" className="size-full object-cover" />
            </span>
          </div>
          <h1 className="mt-5 text-xl font-semibold leading-snug text-balance">
            {signedIn
              ? t.rich("title", { app: appName, nb: (chunks) => <span className="whitespace-nowrap">{chunks}</span> })
              : t("signedOutTitle", { app: appName })}
          </h1>
          <AppHomepage url={client.client_uri} />
          {signedIn && (
            <>
              <AccountChip name={session.user.name} image={session.user.image} label={t("signedInAs", { name: session.user.name })} />
              <button
                type="button"
                disabled={switching}
                onClick={switchAccount}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
              >
                {switching && <Loader2 className="size-3 animate-spin" />}
                {t("switchAccount")}
              </button>
            </>
          )}
        </header>

        {!signedIn && (
          <p className="px-6 text-center text-sm text-muted-foreground">{t("signedOutDescription", { app: appName })}</p>
        )}

        <section className="space-y-5 px-6 pt-5 pb-1">
          <PermissionTree scopes={knownScopes} offlineAccess={wantsOfflineAccess} appName={appName} />
          {unknownScopes.length > 0 && (
            <div role="alert" className="mt-4 flex gap-2.5 rounded-[var(--consent-inset-radius)] border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive dark:text-red-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{t("unknownScopesTitle")}</p>
                <p className="mt-0.5 text-xs">{t("unknownScopesBody", { app: appName, scopes: unknownScopes.join(", ") })}</p>
              </div>
            </div>
          )}
        </section>

        <ul className="space-y-2 px-6 py-5 text-xs text-muted-foreground">
          {redirectHost && (
            <Notice icon={<ExternalLink className="size-3.5" />}>
              {t("redirectNotice", { host: redirectHost })}
            </Notice>
          )}
          <Notice icon={<ShieldAlert className="size-3.5" />}>{t("trustNotice", { app: appName })}</Notice>
          {signedIn && (
            <Notice icon={<RotateCcw className="size-3.5" />}>
              {t.rich("revokeNotice", {
                link: (chunks) => (
                  <Link href="/settings/applications" className="font-medium text-foreground underline-offset-4 hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </Notice>
          )}
        </ul>

        {submitError && (
          <p role="alert" className="mx-6 mb-4 rounded-[var(--consent-inset-radius)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300">
            {submitError}
          </p>
        )}
        </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-card from-25% to-transparent transition-opacity duration-200",
            atEnd && "opacity-0",
          )}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-3 flex justify-center">
          <AnimatePresence>
            {!atEnd && (
              <motion.button
                key="scroll-to-end"
                type="button"
                layout
                onClick={scrollToEnd}
                aria-label={reviewed ? t("scrollToEnd") : undefined}
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 6 }}
                transition={getTransition({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
                style={{ borderRadius: 9999 }}
                className={cn(
                  "pointer-events-auto flex min-h-10 items-center justify-center gap-2 bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-colors hover:bg-primary/90",
                  reviewed ? "size-10" : "px-4 py-2",
                )}
              >
                <ArrowDown className="size-4 shrink-0" />
                {!reviewed && (
                  <motion.span id="consent-scroll-hint" layout="position" className="whitespace-nowrap text-xs font-medium">
                    {t("scrollHint")}
                  </motion.span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        </div>

        <footer className="border-t border-border bg-muted/30 p-4">
          {signedIn ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" disabled={submitting !== null} onClick={() => decide(false)}>
                {submitting === "deny" ? <Loader2 className="size-4 animate-spin" /> : t("deny")}
              </Button>
              <Button
                size="lg"
                disabled={submitting !== null || !canAuthorize || !reviewed}
                aria-describedby={reviewed ? undefined : "consent-scroll-hint"}
                onClick={() => decide(true)}
              >
                {submitting === "accept" ? <Loader2 className="size-4 animate-spin" /> : t("authorize")}
              </Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={() => openAuthDialog({ callbackURL: authorizeUrl(searchParams) })}>
              {t("signIn")}
            </Button>
          )}
        </footer>
      </article>

      <AppLegalLinks client={client} name={appName} />
    </ConsentShell>
  );
}

/**
 * Tracks whether the scrollable body is at its end, and whether the user has reached the end at
 * least once. Content that fits without scrolling counts as reviewed straight away.
 */
function useScrollReview() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  // Null until measured, and treated as reviewed. Starting from false would paint Authorize disabled
  // and then fade it in for content that already fits.
  const [reviewed, setReviewed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!el) return;
    const update = () => {
      const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      setAtEnd(end);
      if (end) setReviewed(true);
    };
    el.addEventListener("scroll", update, { passive: true });
    // Fires once on observe, and again when expanding a group grows the content.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [el]);

  const scrollToEnd = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  };

  // Measuring as the node attaches settles the state before the first paint.
  const attach = useCallback((node: HTMLDivElement | null) => {
    setEl(node);
    if (!node) return;
    const fits = node.scrollHeight - node.clientHeight <= 8;
    setAtEnd(fits);
    setReviewed((prev) => prev === true || fits);
  }, []);

  return { attach, atEnd, reviewed: reviewed !== false, scrollToEnd };
}

// Concentric corners: the card's radius is the 20px pill button radius plus the 16px footer
// padding, and rows inset 24px from the card edge get the remaining 12px.
function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative [--consent-radius:2.25rem] [--consent-inset-radius:0.75rem] flex min-h-dvh items-center justify-center bg-background px-4 py-16"
      style={{ backgroundImage: "radial-gradient(60rem 28rem at 50% -8rem, color-mix(in srgb, var(--primary) 14%, transparent), transparent)" }}
    >
      {!isCNExclusive() && (
        <div className="absolute top-4 right-4">
          <LocaleSwitcher />
        </div>
      )}
      <div className="flex w-full max-w-[26rem] flex-col gap-4">{children}</div>
    </main>
  );
}

function AppMark({ client, name }: { client: PublicClient; name: string }) {
  const logo = safeImg(client.logo_uri);
  return (
    <span className="flex size-14 items-center justify-center overflow-hidden rounded-[1rem] border border-border bg-primary/10 text-xl font-semibold text-primary">
      {logo ? <img src={logo} alt="" className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

function AppHomepage({ url }: { url?: string }) {
  const href = safeHref(url);
  const host = hostOf(href);
  if (!href || !host) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {host}
      <ExternalLink className="size-3" />
    </a>
  );
}

function AccountChip({ name, image, label }: { name: string; image?: string | null; label: string }) {
  return (
    <p className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-background/60 py-1 pr-3.5 pl-1 text-xs text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[0.6875rem] font-semibold text-primary">
        {image ? <img src={image} alt="" className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </p>
  );
}

/** Read-only view of the granted scopes, shaped by the same tree the developer portal uses. */
function PermissionTree({ scopes, offlineAccess, appName }: { scopes: ScopeKey[]; offlineAccess: boolean; appName: string }) {
  const t = useTranslations("oauthConsent");
  const granted = new Set(scopes);
  // `ready` comes with every grant, so it is shown only when nothing else was asked for.
  const tree = grantedScopeTree(scopes.filter((s) => s !== "ready"));
  // Not a data permission, so it sits apart from the read and change sections.
  const stayConnected = offlineAccess && (
    <ul>
      <ScopeLeaf icon="refresh" name={t("offlineAccess.name")} description={t("offlineAccess.description", { app: appName })} />
    </ul>
  );
  if (tree.length === 0) {
    return (
      <>
        <ul><ScopeLeaf name={t("basicAccess")} /></ul>
        {stayConnected}
      </>
    );
  }
  const changes = tree.filter((n) => API_SCOPES[n.key].destructive);
  const reads = tree.flatMap((n) => (n.key === "read" ? (n.children ?? []) : API_SCOPES[n.key].destructive ? [] : [n]));
  return (
    <>
      {changes.length > 0 && (
        <section className="rounded-[var(--consent-inset-radius)] border border-amber-500/30 bg-amber-500/8 p-3">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <TriangleAlert className="size-4" />
            {t("changeHeading")}
          </h2>
          <ul className="space-y-3">
            {changes.map((node) => <ScopeNode key={node.key} node={node} granted={granted} tone="change" />)}
          </ul>
        </section>
      )}
      {stayConnected}
      {reads.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("readHeading")}</h2>
          <ul className="space-y-3">
            {reads.map((node) => <ScopeNode key={node.key} node={node} granted={granted} />)}
          </ul>
        </section>
      )}
    </>
  );
}

function hasSensitive(node: TreeNode): boolean {
  return API_SCOPES[node.key].sensitive || (node.children ?? []).some(hasSensitive);
}

function countLeaves(nodes: TreeNode[]): number {
  return nodes.reduce((n, node) => n + (node.children?.length ? countLeaves(node.children) : 1), 0);
}

function ScopeNode({ node, granted, tone }: { node: TreeNode; granted: Set<ScopeKey>; tone?: "change" }) {
  const t = useTranslations("oauthConsent");
  const ts = useTranslations("settings.developer");
  const [open, setOpen] = useState(false);
  const children = node.children ?? [];
  const name = ts(`scopes.${node.key}.name`);
  const sensitive = hasSensitive(node) ? t("sensitive") : undefined;

  if (children.length === 0) {
    return <ScopeLeaf name={name} description={ts(`scopes.${node.key}.description`)} sensitive={sensitive} tone={tone} />;
  }

  // An umbrella scope is never granted itself, and the app may hold only part of it, so its row
  // counts what was actually granted rather than describing the whole umbrella.
  const description = granted.has(node.key)
    ? ts(`scopes.${node.key}.description`)
    : t("groupCount", { count: countLeaves(children) });
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${name}: ${open ? t("hideDetails") : t("showDetails")}`}
        onClick={() => setOpen((v) => !v)}
        className="group -m-1.5 flex w-[calc(100%+0.75rem)] gap-3 rounded-[var(--consent-inset-radius)] p-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <ScopeMark sensitive={!!sensitive} tone={tone} />
        <ScopeText name={name} description={description} sensitive={sensitive} />
        <ChevronRight className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={getTransition({ duration: 0.22, ease: [0.4, 0, 0.2, 1] })}
            className="overflow-hidden"
          >
            <ul className="mt-3 ml-3 space-y-3 border-l border-border pl-5">
              {children.map((child) => <ScopeNode key={child.key} node={child} granted={granted} tone={tone} />)}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function ScopeLeaf({
  name,
  description,
  sensitive,
  tone,
  icon,
}: {
  name: string;
  description?: string;
  sensitive?: string;
  tone?: "change";
  icon?: "refresh";
}) {
  return (
    <li className="flex gap-3">
      <ScopeMark sensitive={!!sensitive} tone={tone} icon={icon} />
      <ScopeText name={name} description={description} sensitive={sensitive} />
    </li>
  );
}

function ScopeMark({ sensitive, tone, icon }: { sensitive: boolean; tone?: "change"; icon?: "refresh" }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
        tone === "change" || sensitive ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/12 text-primary",
      )}
    >
      {tone === "change" ? (
        <Pencil className="size-3" strokeWidth={2.5} />
      ) : icon === "refresh" ? (
        <RefreshCw className="size-3" strokeWidth={2.5} />
      ) : (
        <Check className="size-3.5" strokeWidth={3} />
      )}
    </span>
  );
}

function ScopeText({ name, description, sensitive }: { name: string; description?: string; sensitive?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
        {name}
        {sensitive && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-2xs font-semibold text-amber-700 dark:text-amber-300">
            {sensitive}
          </span>
        )}
      </p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-px shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function AppLegalLinks({ client, name }: { client: PublicClient; name: string }) {
  const t = useTranslations("oauthConsent");
  const links = [
    { href: safeHref(client.tos_uri), label: t("appTerms") },
    { href: safeHref(client.policy_uri), label: t("appPrivacy") },
  ].filter((l): l is { href: string; label: string } => !!l.href);
  if (links.length === 0) return null;
  return (
    <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium">{name}</span>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-foreground hover:underline">
          {l.label}
        </a>
      ))}
    </nav>
  );
}

function LoadingCard() {
  const t = useTranslations("oauthConsent");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      className="flex flex-col items-center gap-5 rounded-[var(--consent-radius)] border border-border bg-card px-6 py-8 shadow-xl shadow-black/5"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-[1rem]" />
        <Skeleton className="size-14 rounded-[1rem]" />
      </div>
      <Skeleton className="h-6 w-3/4" />
      <div className="w-full space-y-3 pt-2">
        <Skeleton className="h-10 w-full rounded-[var(--consent-inset-radius)]" />
        <Skeleton className="h-10 w-full rounded-[var(--consent-inset-radius)]" />
      </div>
    </div>
  );
}

function ErrorCard({ kind }: { kind: ConsentErrorKind }) {
  const t = useTranslations("oauthConsent");
  const specific = kind !== "missingClient" && kind !== "loadFailed";
  // A bad return address or an edited link points at someone trying to capture the account.
  const security = kind === "redirect" || kind === "tampered";
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--consent-radius)] border border-border bg-card px-6 py-8 text-center shadow-xl shadow-black/5">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-[1rem]",
          security ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        {security ? <ShieldAlert className="size-6" /> : <TriangleAlert className="size-6" />}
      </span>
      <h1 className="text-lg font-semibold text-balance">{specific ? t(`errors.${kind}.title`) : t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{specific ? t(`errors.${kind}.body`) : t(kind)}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
